const express  = require('express');
const app = express();
const port = 3000;

app.use(express.json());

app.get('/',(req,res)=>{
    res.send('My App Works!!!');
});

app.listen(port, ()=> {
    console.log('Server on http://localhost:3000');
});

var temp1 = 0;   // for future use