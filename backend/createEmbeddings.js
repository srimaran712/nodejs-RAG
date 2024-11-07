const {OpenAI}=require('openai')


const createEmbeddings= async(text)=>{
    try{
        const openAI= new OpenAI({
            apiKey:process.env.OPENAI_API_KEY
        })

        //generate embeddings 

        const embeddings= await openAI.embeddings.create({
            input:text,
            model:"text-embedding-ada-002"
        })
        return embeddings

    }catch(error){
          throw new Error(error)
    }
     
}

module.exports={createEmbeddings}