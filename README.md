# Orders MicrService

```
docker compose up -d
```

## Development pasos

1. Clonar el proyecto
2. Crear un archivo `.env` basado en el archivo `.env.template`
3. Levantar la base de datos con `docker compose up -d`
4. Levantar el servidor NATS

```
docker run -d --name nats-main -p 4222:4222 -p 8222:8222 nats
```

5. Levantar el proyecto con `npm run start:dev`

Nota: Para poder migrar la base de datos de acuerdo a prisma usar el comando `npx prisma migrate`
