-- almacena el perfil academico y de contacto vinculado al uid de supabase auth.

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  carrera TEXT NOT NULL,
  facultad TEXT NOT NULL,
  correo TEXT UNIQUE NOT NULL,
  fechanacimiento TEXT NOT NULL,
  fecharegistro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ultimoacceso TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activo BOOLEAN DEFAULT TRUE
);

-- relaciona cada matricula unica con el uid del usuario para integridad referencial.

CREATE TABLE IF NOT EXISTS usuarios_por_matricula (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  CONSTRAINT fk_uid FOREIGN KEY (uid) REFERENCES usuarios(uid) ON DELETE CASCADE
);

-- agrupa conversaciones del chat por usuario y matricula con metadatos de actividad.

CREATE TABLE IF NOT EXISTS chat_sesiones (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  matricula TEXT NOT NULL,
  "fechaCreacion" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "ultimaActividad" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "totalMensajes" INTEGER DEFAULT 0,
  "categoriaPrincipal" TEXT DEFAULT 'general',
  activa BOOLEAN DEFAULT TRUE
);

-- guarda cada mensaje del usuario o del bot dentro de una sesion de chat.

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id SERIAL PRIMARY KEY,
  "sesionId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  matricula TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('usuario', 'bot')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  categoria TEXT DEFAULT 'general',
  CONSTRAINT fk_sesion FOREIGN KEY ("sesionId") REFERENCES chat_sesiones(id) ON DELETE CASCADE
);

-- persiste pares consulta-respuesta del asistente con categoria y marca de tiempo.

CREATE TABLE IF NOT EXISTS historial_consultas (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  matricula TEXT NOT NULL,
  consulta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  categoria TEXT DEFAULT 'general',
  "fechaConsulta" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- registra correos temporalmente bloqueados con tiempo de expiracion configurable.

CREATE TABLE IF NOT EXISTS correos_bloqueados (
  id SERIAL PRIMARY KEY,
  correo TEXT UNIQUE NOT NULL,
  "fechaBloqueo" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activo BOOLEAN DEFAULT TRUE,
  "tiempoExpiracion" INTEGER DEFAULT 300
);

-- lista uids autorizados como administradores del panel y su informacion basica.

CREATE TABLE IF NOT EXISTS admin_usuarios (
  id SERIAL PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  correo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  "fechaCreacion" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activo BOOLEAN DEFAULT TRUE
);

-- asegura columnas camelcase en chat_sesiones si la tabla ya existia con esquema antiguo.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_sesiones' AND column_name = 'fechaCreacion'
    ) THEN
        ALTER TABLE chat_sesiones ADD COLUMN "fechaCreacion" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_sesiones' AND column_name = 'ultimaActividad'
    ) THEN
        ALTER TABLE chat_sesiones ADD COLUMN "ultimaActividad" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_sesiones' AND column_name = 'totalMensajes'
    ) THEN
        ALTER TABLE chat_sesiones ADD COLUMN "totalMensajes" INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_sesiones' AND column_name = 'categoriaPrincipal'
    ) THEN
        ALTER TABLE chat_sesiones ADD COLUMN "categoriaPrincipal" TEXT DEFAULT 'general';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_sesiones' AND column_name = 'activa'
    ) THEN
        ALTER TABLE chat_sesiones ADD COLUMN activa BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- indices simples para filtros frecuentes por uid, matricula, sesion y correo bloqueado.

CREATE INDEX IF NOT EXISTS idx_usuarios_uid ON usuarios(uid);
CREATE INDEX IF NOT EXISTS idx_usuarios_matricula ON usuarios(matricula);
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);
CREATE INDEX IF NOT EXISTS idx_usuarios_por_matricula_matricula ON usuarios_por_matricula(matricula);
CREATE INDEX IF NOT EXISTS idx_usuarios_por_matricula_uid ON usuarios_por_matricula(uid);
CREATE INDEX IF NOT EXISTS idx_chat_sesiones_user ON chat_sesiones("userId");
CREATE INDEX IF NOT EXISTS idx_chat_sesiones_activa ON chat_sesiones(activa);
CREATE INDEX IF NOT EXISTS idx_chat_mensajes_sesion ON chat_mensajes("sesionId");
CREATE INDEX IF NOT EXISTS idx_chat_mensajes_user ON chat_mensajes("userId");
CREATE INDEX IF NOT EXISTS idx_historial_user ON historial_consultas("userId");
CREATE INDEX IF NOT EXISTS idx_correos_bloqueados_correo ON correos_bloqueados(correo);
CREATE INDEX IF NOT EXISTS idx_correos_bloqueados_activo ON correos_bloqueados(activo);
CREATE INDEX IF NOT EXISTS idx_admin_usuarios_uid ON admin_usuarios(uid);

-- indices compuestos y orden temporal alineados con listados del cliente (sesiones, mensajes, historial).

CREATE INDEX IF NOT EXISTS idx_usuarios_activo_fecharegistro
  ON usuarios(activo, fecharegistro DESC)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_sesion_timestamp
  ON chat_mensajes("sesionId", timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_user_timestamp
  ON chat_mensajes("userId", timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_historial_user_fecha
  ON historial_consultas("userId", "fechaConsulta" DESC);

CREATE INDEX IF NOT EXISTS idx_historial_user_categoria
  ON historial_consultas("userId", categoria);

-- reemplaza el indice global de matricula por uno parcial que ignora valores nulos.

DROP INDEX IF EXISTS idx_usuarios_matricula;
CREATE INDEX IF NOT EXISTS idx_usuarios_matricula
  ON usuarios(matricula)
  WHERE matricula IS NOT NULL;

-- ajusta autovacuum en tablas con muchos inserts para reducir bloat y estadisticas viejas.

ALTER TABLE chat_mensajes SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE historial_consultas SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE chat_sesiones SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- borra bloqueos de correo cuyo tiempo desde fechaBloqueo supera tiempoExpiracion (llamada desde supabase.rpc).

CREATE OR REPLACE FUNCTION limpiar_correos_expirados()
RETURNS void AS $$
BEGIN
    DELETE FROM correos_bloqueados
    WHERE activo = true
    AND (EXTRACT(EPOCH FROM (NOW() - "fechaBloqueo"))::INTEGER) > "tiempoExpiracion";
END;
$$ LANGUAGE plpgsql;

-- expone el email del usuario autenticado desde auth.users para politicas de bloqueo.

CREATE OR REPLACE FUNCTION auth_user_email()
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT email FROM auth.users WHERE id = auth.uid());
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- activa rls en todas las tablas de la app visibles desde el cliente supabase.

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_por_matricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE correos_bloqueados ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_usuarios ENABLE ROW LEVEL SECURITY;

-- politicas de dueño: cada usuario solo lee y escribe su propia fila en usuarios.

DROP POLICY IF EXISTS "Users can view their own data" ON usuarios;
CREATE POLICY "Users can view their own data"
    ON usuarios FOR SELECT
    USING (auth.uid()::text = uid);

DROP POLICY IF EXISTS "Users can update their own data" ON usuarios;
CREATE POLICY "Users can update their own data"
    ON usuarios FOR UPDATE
    USING (auth.uid()::text = uid)
    WITH CHECK (auth.uid()::text = uid);

DROP POLICY IF EXISTS "Users can insert their own data" ON usuarios;
CREATE POLICY "Users can insert their own data"
    ON usuarios FOR INSERT
    WITH CHECK (auth.uid()::text = uid);

-- politicas de dueño: la matricula enlazada al uid solo la ve y la edita ese usuario.

DROP POLICY IF EXISTS "Users can view their own matricula" ON usuarios_por_matricula;
CREATE POLICY "Users can view their own matricula"
    ON usuarios_por_matricula FOR SELECT
    USING (auth.uid()::text = uid);

DROP POLICY IF EXISTS "Users can insert their own matricula" ON usuarios_por_matricula;
CREATE POLICY "Users can insert their own matricula"
    ON usuarios_por_matricula FOR INSERT
    WITH CHECK (auth.uid()::text = uid);

DROP POLICY IF EXISTS "Users can update their own matricula" ON usuarios_por_matricula;
CREATE POLICY "Users can update their own matricula"
    ON usuarios_por_matricula FOR UPDATE
    USING (auth.uid()::text = uid)
    WITH CHECK (auth.uid()::text = uid);

DROP POLICY IF EXISTS "Users can delete their own matricula" ON usuarios_por_matricula;
CREATE POLICY "Users can delete their own matricula"
    ON usuarios_por_matricula FOR DELETE
    USING (auth.uid()::text = uid);

-- politicas de dueño: las sesiones de chat quedan acotadas al userId de auth.

DROP POLICY IF EXISTS "Users can view their own chat sessions" ON chat_sesiones;
CREATE POLICY "Users can view their own chat sessions"
    ON chat_sesiones FOR SELECT
    USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can create their own chat sessions" ON chat_sesiones;
CREATE POLICY "Users can create their own chat sessions"
    ON chat_sesiones FOR INSERT
    WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can update their own chat sessions" ON chat_sesiones;
CREATE POLICY "Users can update their own chat sessions"
    ON chat_sesiones FOR UPDATE
    USING (auth.uid()::text = "userId")
    WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can delete their own chat sessions" ON chat_sesiones;
CREATE POLICY "Users can delete their own chat sessions"
    ON chat_sesiones FOR DELETE
    USING (auth.uid()::text = "userId");

-- politicas de dueño: los mensajes solo son visibles para el mismo userId autenticado.

DROP POLICY IF EXISTS "Users can view their own chat messages" ON chat_mensajes;
CREATE POLICY "Users can view their own chat messages"
    ON chat_mensajes FOR SELECT
    USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can create their own chat messages" ON chat_mensajes;
CREATE POLICY "Users can create their own chat messages"
    ON chat_mensajes FOR INSERT
    WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can update their own chat messages" ON chat_mensajes;
CREATE POLICY "Users can update their own chat messages"
    ON chat_mensajes FOR UPDATE
    USING (auth.uid()::text = "userId")
    WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can delete their own chat messages" ON chat_mensajes;
CREATE POLICY "Users can delete their own chat messages"
    ON chat_mensajes FOR DELETE
    USING (auth.uid()::text = "userId");

-- politicas de dueño: el historial de consultas solo aplica al userId de la sesion.

DROP POLICY IF EXISTS "Users can view their own query history" ON historial_consultas;
CREATE POLICY "Users can view their own query history"
    ON historial_consultas FOR SELECT
    USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can create their own query history" ON historial_consultas;
CREATE POLICY "Users can create their own query history"
    ON historial_consultas FOR INSERT
    WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can update their own query history" ON historial_consultas;
CREATE POLICY "Users can update their own query history"
    ON historial_consultas FOR UPDATE
    USING (auth.uid()::text = "userId")
    WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can delete their own query history" ON historial_consultas;
CREATE POLICY "Users can delete their own query history"
    ON historial_consultas FOR DELETE
    USING (auth.uid()::text = "userId");

-- politicas de bloqueo: el correo coincide con auth o con el usuario ya registrado en usuarios.

DROP POLICY IF EXISTS "Users can view their blocked email" ON correos_bloqueados;
CREATE POLICY "Users can view their blocked email"
    ON correos_bloqueados FOR SELECT
    USING (
        correo = auth_user_email()
        OR
        EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.correo = correos_bloqueados.correo
            AND usuarios.uid = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can manage their own blocked email" ON correos_bloqueados;
CREATE POLICY "Users can manage their own blocked email"
    ON correos_bloqueados FOR INSERT
    WITH CHECK (
        correo = auth_user_email()
        OR
        EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.correo = correos_bloqueados.correo
            AND usuarios.uid = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can update their own blocked email" ON correos_bloqueados;
CREATE POLICY "Users can update their own blocked email"
    ON correos_bloqueados FOR UPDATE
    USING (
        correo = auth_user_email()
        OR
        EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.correo = correos_bloqueados.correo
            AND usuarios.uid = auth.uid()::text
        )
    )
    WITH CHECK (
        correo = auth_user_email()
        OR
        EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.correo = correos_bloqueados.correo
            AND usuarios.uid = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can delete their own blocked email" ON correos_bloqueados;
CREATE POLICY "Users can delete their own blocked email"
    ON correos_bloqueados FOR DELETE
    USING (
        correo = auth_user_email()
        OR
        EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.correo = correos_bloqueados.correo
            AND usuarios.uid = auth.uid()::text
        )
    );

-- politicas de panel: solo un admin activo puede listar o mutar la tabla admin_usuarios.

DROP POLICY IF EXISTS "Admins can view admin users" ON admin_usuarios;
CREATE POLICY "Admins can view admin users"
    ON admin_usuarios FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );

DROP POLICY IF EXISTS "Admins can insert admin users" ON admin_usuarios;
CREATE POLICY "Admins can insert admin users"
    ON admin_usuarios FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );

DROP POLICY IF EXISTS "Admins can update admin users" ON admin_usuarios;
CREATE POLICY "Admins can update admin users"
    ON admin_usuarios FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );

DROP POLICY IF EXISTS "Admins can delete admin users" ON admin_usuarios;
CREATE POLICY "Admins can delete admin users"
    ON admin_usuarios FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
        AND uid != auth.uid()::text
    );

-- limpia admins de prueba y reinserta el administrador por defecto (revisa uid en produccion).

DELETE FROM admin_usuarios WHERE correo LIKE '%admin%' OR uid = 'ae9e80f1-4fff-41a4-bd34-0bf7cb1856e6';

INSERT INTO admin_usuarios (uid, correo, nombre, activo)
VALUES (
    'ae9e80f1-4fff-41a4-bd34-0bf7cb1856e6',
    'admin@bitbotfiee.xyz',
    'Administrador Principal',
    true
)
ON CONFLICT (uid) DO UPDATE
SET correo = EXCLUDED.correo,
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo;

-- concede a los admins listados permiso de lectura y escritura sobre todas las filas de usuarios.

DROP POLICY IF EXISTS "Admins can view all users" ON usuarios;
CREATE POLICY "Admins can view all users"
    ON usuarios FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );

DROP POLICY IF EXISTS "Admins can update any user" ON usuarios;
CREATE POLICY "Admins can update any user"
    ON usuarios FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );

DROP POLICY IF EXISTS "Admins can insert users" ON usuarios;
CREATE POLICY "Admins can insert users"
    ON usuarios FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );

DROP POLICY IF EXISTS "Admins can delete users" ON usuarios;
CREATE POLICY "Admins can delete users"
    ON usuarios FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM admin_usuarios
            WHERE uid = auth.uid()::text AND activo = true
        )
    );
