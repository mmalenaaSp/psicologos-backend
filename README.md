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
| Autenticación y autorización | Pendiente |
| Pruebas automatizadas | Pendiente |

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

Los CRUD de Psicólogo y Paciente se probaron manualmente con Thunder Client. Se verificaron operaciones correctas y distintos casos de error. Aún no hay una suite automatizada de pruebas.

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

**Este backend está en desarrollo y no debe utilizarse con información real de pacientes ni exponerse públicamente sin incorporar autenticación, autorización y otras medidas de seguridad.** Para las pruebas utilizar datos ficticios.

Próximos pasos: integrar los CRUD restantes, implementar los casos de uso de turnos y liquidaciones, agregar pruebas automatizadas y ampliar la documentación de la API.

## Repositorio

[GitHub — PsycoGest Backend](https://github.com/mmalenaaSp/psicologos-backend)
