// script node: lee yaml de RASA y genera catalogoRasa.json para el panel admin del front.
// uso desde carpeta REACT: node scripts/generar-catalogo-rasa.mjs

import fs from 'fs'; //lectura y escritura de archivos.
import path from 'path'; //une rutas de forma portable.
import { fileURLToPath } from 'url'; //obtiene __dirname en modulos esm.
import yaml from 'js-yaml'; //parsea archivos yml del proyecto Rasa.

const __dirname = path.dirname(fileURLToPath(import.meta.url)); //directorio de este script.
const rootProyecto = path.resolve(__dirname, '..', '..'); //raiz del monorepo (sube dos niveles).
const rasaDir = path.join(rootProyecto, 'RASA'); //carpeta donde vive domain.yml y data/.

const outPath = path.join(__dirname, '..', 'src', 'datos', 'catalogoRasa.json'); //json consumido por Admin.js.

function readYaml(name) {
  //carga un yaml desde RASA o RASA/data segun name.
  const p = path.join(rasaDir, name); //ruta absoluta al fichero.
  if (!fs.existsSync(p)) {
    //falla temprano si falta un archivo requerido.
    throw new Error(`No se encontró: ${p}`); //mensaje con ruta completa.
  }
  return yaml.load(fs.readFileSync(p, 'utf8')); //parsea contenido utf8 a objeto js.
}

function snippet(text, max = 140) {
  //acorta texto largo para previews en la ui.
  if (!text || typeof text !== 'string') return ''; //sin texto devuelve vacio.
  const one = text.replace(/\s+/g, ' ').trim(); //colapsa espacios en una linea.
  return one.length <= max ? one : `${one.slice(0, max)}…`; //recorta con elipsis si hace falta.
}

function parseExamplesBlock(examples) {
  //convierte bloque multilinea de ejemplos nlu en arreglo de strings.
  if (!examples || typeof examples !== 'string') return []; //sin bloque devuelve lista vacia.
  return examples
    .split('\n') //cada linea puede ser un ejemplo con prefijo guion.
    .map((line) => line.replace(/^\s*-\s*/, '').trim()) //quita guion inicial de yaml.
    .filter(Boolean); //descarta lineas vacias.
}

function main() {
  //orquesta lectura, transformacion y escritura del catalogo.
  const domain = readYaml('domain.yml'); //intents, actions, responses.
  const nluData = readYaml(path.join('data', 'nlu.yml')); //ejemplos por intent.
  const rulesData = readYaml(path.join('data', 'rules.yml')); //reglas fijas intent accion.
  const storiesData = readYaml(path.join('data', 'stories.yml')); //historias de dialogo.

  const intents = domain.intents || []; //lista de intents declarados en domain.
  const customActions = domain.actions || []; //acciones custom y utter referenciadas.

  const responsesRaw = domain.responses || {}; //mapa utter_* a variantes de texto.
  const responses = Object.entries(responsesRaw).map(([utter, variants]) => {
    //normaliza cada respuesta para contar variantes y preview.
    const arr = Array.isArray(variants) ? variants : []; //asegura arreglo iterable.
    let variantCount = 0; //cuenta entradas con campo text.
    let firstText = ''; //primer texto para snippet en tabla admin.
    for (const v of arr) {
      //recorre variantes del utter.
      if (v && typeof v === 'object' && v.text) {
        //solo cuenta objetos con texto visible.
        variantCount += 1; //incrementa contador.
        if (!firstText) firstText = v.text; //guarda primera cadena no vacia.
      }
    }
    return {
      utter, //nombre de la respuesta tipo utter_*.
      variantCount, //numero de variantes con texto.
      preview: snippet(firstText, 160), //resumen corto para la tabla.
    };
  });

  const nluBlocks = nluData.nlu || []; //secciones nlu del yaml.
  const nlu = nluBlocks.map((block) => {
    //cada bloque tiene intent y bloque de ejemplos.
    const intent = block.intent; //nombre del intent.
    const allExamples = parseExamplesBlock(block.examples); //lista de frases de entrenamiento.
    const exampleCount = allExamples.length; //total de ejemplos.
    const samples = allExamples.slice(0, 10); //muestra hasta diez en el json.
    return { intent, exampleCount, samples }; //forma consumida por el panel.
  });

  const rules = (rulesData.rules || []).map((r) => {
    //extrae intent y accion principal de cada regla.
    const title = r.rule || '(sin nombre)'; //titulo legible de la regla.
    const steps = r.steps || []; //pasos declarados en yaml.
    let intent = ''; //ultimo intent encontrado en pasos.
    let action = ''; //ultima accion encontrada en pasos.
    for (const s of steps) {
      //busca pares intent accion en orden lineal.
      if (s && typeof s.intent === 'string') intent = s.intent; //actualiza intent si aplica.
      if (s && typeof s.action === 'string') action = s.action; //actualiza accion si aplica.
    }
    return { title, intent, action }; //estructura para la vista de reglas.
  });

  const stories = (storiesData.stories || []).map((st) => {
    //similar a rules pero para historias nombradas.
    const title = st.story || '(sin nombre)'; //nombre de la historia.
    const steps = st.steps || []; //pasos de la historia.
    let intent = ''; //ultimo intent detectado.
    let action = ''; //ultima accion detectada.
    for (const s of steps) {
      //recorre pasos de la historia.
      if (s && typeof s.intent === 'string') intent = s.intent; //captura intents en orden.
      if (s && typeof s.action === 'string') action = s.action; //captura acciones en orden.
    }
    return { title, intent, action }; //fila para la pestaña stories del admin.
  });

  const catalogo = {
    //objeto raiz escrito como json indentado.
    meta: {
      generado: new Date().toISOString(), //marca de tiempo de la generacion.
      fuentes: [
        //rutas relativas al repo solo informativas.
        'RASA/domain.yml',
        'RASA/data/nlu.yml',
        'RASA/data/rules.yml',
        'RASA/data/stories.yml',
      ],
    },
    intents, //lista cruda de intents del domain.
    customActions, //acciones declaradas en domain.
    responses, //utter con conteos y preview.
    nlu, //bloques nlu con muestras.
    rules, //reglas simplificadas.
    stories, //historias simplificadas.
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true }); //asegura carpeta src/datos.
  fs.writeFileSync(outPath, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8'); //escribe json legible.
  console.log(`OK: ${outPath}`); //confirma ruta de salida en consola.
  console.log(
    //resumen numerico para verificar en terminal.
    `  intents=${intents.length} responses=${responses.length} nlu=${nlu.length} rules=${rules.length} stories=${stories.length}`,
  );
}

main(); //punto de entrada al ejecutar el script.
