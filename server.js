const express  = require('express');
const multer =require('multer');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));


// Multer setup                                         
const upload = multer({
    storage: multer.memoryStorage(),
    limit: {fileSize:5 * 1024 * 1024},                   // ********** 5MB limit
    fileFilter:(req,file,cb)=>{
        const allowedTypes = ['image/jpeg','image/png','application/pdf'];
    if(allowedTypes.includes(file.mimetype)){
        cb(null,true);
    }
    else{
        cb(new Error('Only JPG, PNG or PDF files are allowed'));
    }
    }
});


//Upload route 
app.post('/upload',upload.single('file'),(req,res)=>{
    if(!req.file){
        return res.status(400).json({error:'No file uploaded'});
    }
    res.json({filename: req.file.originalname, type: req.file.minetype});
})



app.get('/',(req,res)=>{
    res.send('My App Works!!!');
});

app.listen(port, ()=> {
    console.log('Server on http://localhost:3000');
});

var temp1 = 0;   // for future use