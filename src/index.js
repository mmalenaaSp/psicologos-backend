const express = require('express');
const cors = require('cors'); //herramienta de seguridad

const app = express(); //crea la applicacion en si, "app" va a ser el servidor
const PORT = process.env.PORT || 3000;

app.use(cors()); 
app.use(express.json()); //traduce el texto a un objeto JSON de JavaScript para poder guardarlo en Prisma.

app.get('/', (req, res) => { //es como de prueba
  res.send('Servidor de PsycoGest funcionando correctamente 🚀');
}); //"Cuando alguien entre a la ruta raíz, respondé (res.send) con este texto de éxito"

app.listen(PORT, () => {  //prende el servidor
  console.log(`Servidor corriendo en el puerto ${PORT}`); //aviso de que el servidor está corriendo
});