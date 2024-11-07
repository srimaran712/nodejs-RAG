const Express=require('express')
const Cors=require('cors')
const axios=require('axios')
const bodyParser= require('body-parser')
const fileSystem= require('fs')

const MongoDB= require('mongodb')
///creating a express application server

require('dotenv').config() // accessing environment variables

const app= Express()
app.use(Cors({
    origin:"*"
}))
app.use(bodyParser.json())

///pdf parser
const pdfParser= require("pdf2json")
const parser= new pdfParser(this,1)

//importing embeddings function

const {createEmbeddings}=require('./createEmbeddings')



//connecting database
app.get('/',async(req,res)=>{
    try{
        const connection= await MongoDB.MongoClient.connect(process.env.MONGO_URI)
        console.log('connected')
        const db= connection.db('nodeRAG')
        const collection= db.collection('docs')
        await collection.insertOne({test:'success'})
        await connection.close()
        res.json({title:'express'})

    }catch(error){
      console.log(error)
    }
})
///just loading the document
app.post('/load-document',async(req,res)=>{
    try{
        parser.loadPDF('./nfnlabs.pdf')
        //whenever the parser called event triggered 'pdfparser_dataready'
parser.on("pdfParser_dataReady",async(data)=>{
    await fileSystem.writeFileSync('./nfn.txt',parser.getRawTextContent())

   const textFile= await fileSystem.readFileSync('./nfn.txt','utf-8')
    const splitContent=textFile.split('/n')
    const connection= await MongoDB.MongoClient.connect(process.env.MONGO_URI)
    const db= connection.db('nodeRAG')
    const collection= db.collection('docs')

    

    for(let splittext of splitContent){
     const embedding=   await createEmbeddings(splittext)

     //I'm inserting this embeddings in the mongoDB database
     await collection.insertOne({
        text:splittext,
        embedding:embedding.data[0].embedding
     })
     
     console.log(embedding)
    }
    await connection.close()
    res.json('done')
})
       

    }catch(error){
        console.log(error)
        res.status(500).json({message:'error'})
    }
})

///sending a text to convert this number
app.get('/embeddings',async(req,res)=>{//checking whether embedding is working or not
    try{
        const embedding= await createEmbeddings('Hello world')
        res.json(embedding)

    }catch(err){
         console.log(err);
         res.status(500).json({message:'error'})
    }
})

const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>{
    console.log(`server connected ${PORT}`)
})