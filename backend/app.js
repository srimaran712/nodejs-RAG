const Express=require('express')
const Cors=require('cors')
const axios=require('axios')
const bodyParser= require('body-parser')
const fileSystem= require('fs')
//OpenAI
const {OpenAI}= require('openai')

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

///result of the application
// {
//     "message":"services offering at NFN labs "
// }
//output retrieval
// "**Services Offered at NFN Labs**
// \n\nNFN Labs provides a comprehensive range of services to take your products from concept
//  to implementation. Here’s a breakdown of their offerings:\n\n- **Ideation**\n- **Product 
//  Design**\n  - **User Experience (UX):** Focus on usability and accessibility.\n 
//   - **Interface Design (UI):** Developing visual and interactive aspects.\n  - **Interaction Design (IXD):** Shaping interactive components for better user experiences.\n\n- **Product Development**\n 
//    - **Mobile App Development:** Crafting applications for iOS and Android.\n  - **Web App Development:** Developing web-based applications with a focus on responsive design.\n  - **Backend Development:** Building server-side software and architecture.\n\n- **Other Services**\n  - **CMS Customization:** Enhancing functionality and user experience of content management systems.\n  - **Payment and Subscription Processing:** Setting up various payment solutions.\n  - **New Age Platforms:** Utilizing cutting-edge technologies for innovative digital solutions.\n  - **Marketing Websites:** Creating visually appealing and strategically structured websites.\n\nFor more details on their services, you can visit [NFN Labs](https://fnlabs.in/). \n\nIf you have any further questions or need assistance with something else, feel free to ask!"

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

///retrieval phase
app.post('/chat',async(req,res)=>{
    try{
        let sessionId= req.body.sessionId
        const connection= await MongoDB.MongoClient.connect(process.env.MONGO_URI)
        const db= connection.db('nodeRAG')
        if(!sessionId){
            const collection=db.collection('sessions')
          const sessiondata=  await collection.insertOne({createdAt: new Date()})
          sessionId=sessiondata._id
        }
        if(sessionId){
            const collection= db.collection('sessions')
            const sessiondata= await collection.findOne({_id:new MongoDB.ObjectId(sessionId)})
            if(sessiondata){
               res.json({
                message:'we are founding the sessionId'
               })
            }else{
                res.json({
                    message:'sorry buddy no session id are there'
                })
            }
        }

        //working with user query
        const message=req.body.message;
        const conversationCollection= db.collection('conversations')
        await conversationCollection.insertOne({
            sessionId:sessionId,
            message:message,
            role:"User",
            createdAt:new Date()
        })
        const messageVector= await createEmbeddings(message)
        const docsCollection= db.collection('docs')
        //aggregating with docs because my vector are in this collection
     const vectorSearch=  await  docsCollection.aggregate([
        {
            $vectorSearch:{
                index:"default",
                path:"embedding",
                queryVector:messageVector.data[0].embedding,
                numCandidates:150,
                limit:10
            }
        },
        {
            $project:{
                _id:0,
                text:1,
                score:{
                    $meta:"vectorSearchScore"
                }
            }
        }
       ]).toArray()

        // Concatenate search results for prompt
        const context = vectorSearch.map(doc => doc.text).join("\n");

       const openAi= new OpenAI({
        apiKey:process.env.OPENAI_API_KEY
       })
      const chatResult= await openAi.chat.completions.create({
        model:"gpt-4o-mini",
        messages:[
            {
                role:"system",
                content:"You are a smart virtual assistant who is helpful, polite, and friendly, designed to assist users by answering queries about the company `NFN Labs` based on the information available in the provided context. The response you provide is specific, comprehensive, and always neatly formatted. You always maintain a polite and helpful tone throughout the conversation, speaking in a first-person tone. You answer only what is asked and only based on the provided source context. Your primary goal is to assist users efficiently by providing accurate information, guiding them to the appropriate resources, and ensuring a positive interaction experience.%0AInstructions:%0A1. Answering Queries:%0A• Provide clear, concise answers that directly address the user's question.%0A• Avoid verbosity and unnecessary details.%0A• Use bullet points and boldface for headings and subheadings where appropriate.%0A• Include relevant hyperlinks to NFN Labs resources when available.%0A2. Recognizing Synonyms and Related Terms:%0A• Understand and respond appropriately to synonymous or closely related terms across all query types.%0A• For example, interpret 'employees' as 'team members' and 'services' as 'offerings' if applicable.%0A3. Handling Unanswered Queries:%0A• If insufficient information is available, respond with: 'I’m sorry, but I don’t have enough information to provide an accurate answer at this moment. You could reach out to us by email at contact@nfnlabs.in or drop a message at +91-98403-86647.'%0A• Avoid assumptions or unrelated information.%0A4. Handling Follow-up Questions:%0A• Refer to previous context to maintain continuity in the conversation.%0A• If irrelevant, treat the current query as a new one.%0A5. Clarifying Ambiguous Queries:%0A• Politely ask for more details if a question is unclear.%0A• Suggest relevant NFN Labs topics if the user seems unsure.%0A6. Handling Money-Related Queries:%0A• For questions about rates, fees, or pricing, inform the user that specific pricing information isn’t available.%0A• Guide the user to contact NFN Labs directly and include a friendly closing statement like, 'Looking forward to connecting with you!'%0A7. Ending Conversations:%0A• Conclude with a polite and friendly closing statement, asking if you’ve answered their question and how else you can assist.%0A8. Pointing Out Errors:%0A• Graciously accept any pointed-out errors, assure the user that you'll inform your creators, and maintain a polite tone.%0A9. Handling Competitor-Related Queries:%0A• Respond with a cheeky but polite remark that highlights NFN Labs' strengths without directly comparing or criticizing competitors.%0A• Avoid mentioning other company names.%0A10. Responding to Unrelated or Random Questions:%0A• Reply with a playful, cheeky remark that redirects the conversation to NFN Labs' offerings or services.%0A• Maintain a friendly, engaging tone to encourage relevant discussion. ",

            },
            {
                role:"user",
                content:`Context:\n${context}\n\nAnswer the following question based on the context above:\n${message}`
            }
        ]
       })
          return res.json(chatResult.choices[0].message.content)
    }catch(error){
        console.log(error)
    }
})

///result output

//query
// {
//     "message":"careers at NFN labs "
// }

///result
//"Certainly! Here’s the information regarding
 //**Careers at NFN Labs**:\n\n### Job Opportunities\n- NFN Labs is currently offering various career opportunities. \n- To check out the latest openings, you can visit the [NFN Labs Careers Page]
 //(https://fnlabs.in/careers#openings).\n\n### Application Process\n- You can apply for positions directly through the careers page.\n- For inquiries related to careers, you may also reach out via:\n  - **Email:** work@nfnlabs.in\n  - **Phone:** +91-98403-86647\n\n### Work Environment\n- NFN Labs is a fully remote, independent design and development studio, allowing for flexibility and a collaborative work culture.\n- The team comprises diverse professionals including designers, developers, QA engineers, and product managers who aim to bring innovative ideas to life.\n\nIf you have any further questions or need assistance with something else, feel free to ask!",

const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>{
    console.log(`server connected ${PORT}`)
})


//https://medium.com/widle-studio/building-ai-solutions-with-langchain-and-node-js-a-comprehensive-guide-widle-studio-4812753aedff