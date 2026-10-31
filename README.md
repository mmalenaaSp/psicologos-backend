# PsycoGest — Backend

**Trabajo Práctico Integrador — Desarrollo de Software**

Ingeniería en Sistemas de Información · UTN Facultad Regional Rosario

## ¿Qué es PsycoGest?

PsycoGest es un sistema en desarrollo para facilitar la administración del trabajo de psicólogos independientes. Busca centralizar información de pacientes, profesionales, sesiones y obras sociales, y mejorar el seguimiento de liquidaciones y pagos de prestaciones.

Este repositorio contiene el **backend** y su API REST. El proyecto todavía se encuentra en desarrollo.

## Estado de las funcionalidades

| Módulo | Estado |
| --- | --- |
| CRUD de Psicólogo | Implementado y probado manualmente |
| CRUD de Paciente | Implementado y probado manualmente |
| Lugar y Tipo de Sesión | En desarrollo / pendiente de integración |
| Colegio de Psicólogos y Obra Social | En desarrollo / pendiente de integración |
| Turnos y liquidaciones | Pendiente |
| Autenticación y autorización | Sesiones en cookie HttpOnly y permisos por rol |
| Pruebas automatizadas | HTTP, perfiles y aislamiento con datos ficticios |

> Los modelos definidos en Prisma no implican que todos sus endpoints estén implementados.

## Tecnologías

- **Node.js** y **JavaScript** (CommonJS).
- **Express 5** para la API REST.
- **MySQL** como base de datos relacional.
- **Prisma ORM 6.19.3** para consultas y migraciones.
- **bcrypt** para el hash de contraseñas de psicólogos.
- **cors**, **dotenv** y **Nodemon** como herramientas de soporte.
- **Git y GitHub** para el trabajo colaborativo.

## Requisitos previos

- Git instalado.
- Node.js y npm instalados (el equipo probó el proyecto con Node.js 24).
- MySQL Server instalado y en funcionamiento.
- Un cliente para ejecutar consultas SQL (por ejemplo, MySQL Workbench), opcional pero recomendado.

## Instalación local

### 1. Clonar el repositorio

```bash
git clone https://github.com/mmalenaaSp/psicologos-backend.git
cd psicologos-backend
```

Si ya tenés el repositorio clonado y no tenés cambios locales pendientes, actualizá `main` con:

```bash
git switch main
git pull --ff-only origin main
```

### 2. Instalar dependencias

```bash
npm ci
```

### 3. Crear una base de datos de desarrollo

Iniciá MySQL y ejecutá esta instrucción desde tu cliente SQL:

```sql
CREATE DATABASE IF NOT EXISTS psycogest_db;
```

### 4. Configurar el entorno

Creá un archivo **`.env`** en la raíz del repositorio con tu propia conexión:

```dotenv
DATABASE_URL="mysql://USUARIO:CONTRASENA@localhost:3306/psycogest_db"
```

Reemplazá `USUARIO` y `CONTRASENA` por las credenciales de tu MySQL local. Si la contraseña contiene caracteres especiales, codificalos para una URL.

**Nunca subas `.env` al repositorio** ni compartas sus credenciales. El archivo se encuentra excluido en `.gitignore`.

### 5. Preparar Prisma

Primero verificá que Prisma esté conectado a la base correcta y revisá qué migraciones faltan:

```bash
npx prisma validate
npx prisma migrate status
```

En una **base de desarrollo nueva y vacía**, aplicá las migraciones existentes:

```bash
npx prisma migrate deploy
npx prisma generate
```

**Advertencias sobre migraciones:**

- Confirmá que el comando esté apuntando a **tu base local** antes de aplicar migraciones.
- Una migración existente incorpora una contraseña obligatoria a `Psicologo`; puede fallar si la tabla ya contiene registros. No fuerces la operación sin revisar cómo preservar esos datos.
- Las migraciones actuales fueron verificadas en MySQL sobre Windows. Queda pendiente resolver la consistencia de mayúsculas/minúsculas de nombres de tablas para instalaciones de MySQL sensibles a mayúsculas, como algunas configuraciones en Linux.
- No uses `prisma migrate reset` sobre una base con datos que quieras conservar.

### 6. Ejecutar el servidor

Modo desarrollo, con reinicio automático:

```bash
npm run dev
```

Inicio sin Nodemon:

```bash
npm start
```

El servidor utiliza el puerto **3000** por defecto. Para comprobarlo, abrí:

- http://localhost:3000/
- http://localhost:3000/api/psicologos
- http://localhost:3000/api/pacientes

Los endpoints de listado devuelven un arreglo vacío (`[]`) si no hay registros activos.

### 7. Examinar la base de datos (opcional)

```bash
npx prisma studio
```

Prisma Studio suele abrir en http://localhost:5555/.

## Endpoints disponibles

### Psicólogos

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/psicologos` | Crear psicólogo |
| `GET` | `/api/psicologos` | Listar psicólogos activos |
| `GET` | `/api/psicologos/:id` | Obtener psicólogo activo por ID |
| `PUT` | `/api/psicologos/:id` | Actualizar datos de un psicólogo activo |
| `DELETE` | `/api/psicologos/:id` | Baja lógica del psicólogo |

Para crear un psicólogo se necesita un `colegioId` que exista en la base de datos. El campo `password` recibido en el POST se almacena como hash; no se devuelve la contraseña en las respuestas previstas por el controlador.

### Pacientes

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/pacientes` | Crear paciente |
| `GET` | `/api/pacientes` | Listar pacientes activos |
| `GET` | `/api/pacientes/:id` | Obtener paciente activo por ID |
| `PUT` | `/api/pacientes/:id` | Actualizar datos de un paciente activo |
| `DELETE` | `/api/pacientes/:id` | Baja lógica del paciente |

**Ejemplo de creación de paciente** (Thunder Client o Postman):

```http
POST http://localhost:3000/api/pacientes
Content-Type: application/json
```

```json
{
  "dni": "00000001",
  "nombre": "Lucia",
  "apellido": "Prueba",
  "telefono": "0000000000",
  "fechaNacimiento": "2001-05-15"
}
```

El `dni` debe ser único. `fechaNacimiento` se envía con formato `AAAA-MM-DD`. El campo `obraSocialId` es opcional; si se proporciona, debe referir a una obra social existente.

**Baja lógica:** `DELETE` no elimina físicamente el registro; establece `activo: false`. Los GET habituales muestran solamente registros activos.

Las actualizaciones mediante `PUT` actualmente aceptan **campos parciales**, según las validaciones implementadas en los controladores.

## Pruebas y respuestas HTTP

Los CRUD de Psicólogo y Paciente se probaron manualmente con Thunder Client. Se verificaron operaciones correctas y distintos casos de error. La suite automatizada se ejecuta con `npm test` y reemplaza Prisma por almacenamiento en memoria: no accede a `DATABASE_URL`.

Los controladores utilizan, según el caso, estos códigos:

| Código | Significado |
| --- | --- |
| `200` | Operación exitosa |
| `201` | Recurso creado |
| `400` | Datos inválidos o referencia incorrecta |
| `404` | Recurso inexistente o inactivo |
| `409` | Conflicto de unicidad (por ejemplo, DNI repetido) |
| `500` | Error interno |

## Estructura principal

```text
psicologos-backend/
├── prisma/
│   ├── migrations/          # Historial de migraciones SQL
│   └── schema.prisma        # Modelos y relaciones
├── src/
│   ├── controllers/         # Lógica de los endpoints
│   ├── routes/              # Definición de rutas
│   └── index.js             # Servidor Express
├── prisma.config.ts         # Configuración de Prisma
├── package.json
├── package-lock.json
└── README.md
```

## Trabajo colaborativo con Git

La rama **`main`** contiene la versión compartida del backend. Cada integrante desarrolla sus tareas en una rama propia y propone su integración mediante un **Pull Request**.

Para comenzar una funcionalidad nueva, con el repositorio limpio:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/nombre-funcionalidad
```

Antes de modificar `prisma/schema.prisma` o generar migraciones nuevas, coordinarlo con el equipo, porque todas las entidades comparten una misma base de datos.

No subir `node_modules`, `.env` ni archivos con datos personales de pacientes.

## Seguridad y trabajo pendiente

El login y los permisos por rol están implementados. La validación usa datos ficticios: pruebas en memoria, navegador con API aislada y una base MySQL local nueva de pruebas.

Próximos pasos: integrar los CRUD restantes, implementar los casos de uso de turnos y liquidaciones, agregar pruebas automatizadas y ampliar la documentación de la API.

## Repositorio

[GitHub — PsycoGest Backend](https://github.com/mmalenaaSp/psicologos-backend)

## Registro y perfiles propios

El registro PACIENTE/PSICOLOGO crea una cuenta ACTIVO sin fichas asociadas y permite iniciar sesión inmediatamente. Login y /auth/me incluyen perfilCompleto. Si falta el perfil, sólo se habilitan su formulario propio, sesión y logout. Las cuentas PENDIENTE anteriores también pueden completar su perfil; sólo ese guardado cambia su estado, sin actualizar usuarios masivamente. BLOQUEADO sigue sin acceso.

GET /api/mi-perfil devuelve {usuario, perfil}; PUT crea o edita exclusivamente ese perfil dentro de una transacción Serializable. GET /api/mi-perfil/opciones devuelve colegios/obras propios o compartidos, sin datos clínicos. No se aceptan IDs de fichas, rol ni propietario en el formulario. Un conflicto de DNI/correo/matrícula devuelve 409 y no vincula fichas anteriores.

Paciente: nombre, apellido, teléfono, DNI y fechaNacimiento AAAA-MM-DD; obraSocialId opcional. Profesional: nombre, apellido, teléfono, dirección, nroMatricula y colegioId. También admite colegio: {nombre, distrito, direccion} para crearlo en la misma transacción. Correo y hash del campo legado obligatorio Psicologo.contraseña proceden de la cuenta autenticada. No se devuelven hashes. Se retiró el comando account:activate; no hay aprobación manual.

Los CRUD exigen sesión, rol PSICOLOGO y perfil completo. Pacientes, lugares y tipos de sesión se consultan/modifican sólo por propietarioId del usuario; las fichas anteriores con NULL quedan aisladas. Psicólogos sólo permite su propio perfil; su primera creación se hace en /mi-perfil y crear un segundo devuelve 409. Colegios/obras permiten lectura de propios y compartidos NULL, pero modificación sólo de propios. Se verifica propiedad en cada consulta, incluyendo GET por ID, PUT y DELETE. El paciente usa exclusivamente /mi-perfil. Completar una matrícula no verifica identidad profesional ni habilita información clínica preexistente.

La migración aditiva 20261031010000_propietarios_registros agrega propietarios opcionales e índices sin eliminar ni reasignar datos. Antes de usar el código con una base local de pruebas, aplicar las migraciones pendientes con npx prisma migrate deploy y generar con npx prisma generate. En la base local de desarrollo se aplicaron sólo las migraciones aditivas de Sesion y propietarios. No se consultaron ni reasignaron fichas, ni se cambiaron estados de usuarios.

Configuración: .env.example. FRONTEND_URL debe ser el origen exacto del frontend (http://localhost:5173 por defecto). Las solicitudes POST/PUT/PATCH usan application/json y el frontend envía cookies. Sesión de cuatro horas, cookie HttpOnly y SameSite=Strict; Secure con HTTPS en producción. La base conserva el hash del token.

Pruebas: npm test usa Prisma en memoria y datos ficticios, sin consultar DATABASE_URL. Cubre ambos roles, perfil incompleto, estado pendiente anterior, aislamiento entre cuentas y fichas NULL, conflictos sin vinculación, validaciones, logout, cookies, origen y límite de intentos. El frontend ofrece npm run test:ui con Edge/Chrome temporal y API ficticia aislada.

### Prueba MySQL real y bases aisladas

El script scripts/verificar-mysql.cjs requiere la variable RUN_ISOLATED_MYSQL_TEST=1. Usa las credenciales locales en memoria para crear una base nueva aleatoria en el mismo MySQL local, aplica migraciones sólo allí y prueba HTTP con Prisma real. No consulta tablas de la base original, no cambia .env, no imprime credenciales y no ejecuta DROP. Cada ejecución conserva su base ficticia de pruebas.

La ejecución final pasó 103 comprobaciones de registro, sesiones, perfiles, concurrencia, CRUD propios y rechazo de accesos ajenos. El primer intento detectó un filtro nullable de Prisma que ya se corrigió.

Bases de prueba conservadas:

- Intento inicial: psycogest_codex_test_mvvnrhra_360cd3114d177ba1
- Ejecución exitosa: psycogest_codex_test_mvvnt1xa_fe103fd4e66f0090

Después de validar las pruebas aisladas, se aplicaron en la base local de desarrollo las dos migraciones pendientes: Sesion y propietarios. No se ejecutaron migraciones destructivas ni se leyeron datos clínicos. El script de prueba sólo trabaja con su propia base aleatoria.

## Turnos, reservas y liquidaciones

Implementación, migración, archivos, pruebas y recorrido manual: [IMPLEMENTACION_TURNOS.md](IMPLEMENTACION_TURNOS.md).

## Perfil público profesional

Edición de la presentación, fotos por URL, detalle público, migración y pruebas: [IMPLEMENTACION_PERFIL_PUBLICO.md](IMPLEMENTACION_PERFIL_PUBLICO.md).
