db.articles.insertMany([
  {
    title: "Introduction to MongoDB",
    content: "MongoDB is a NoSQL document-oriented database that stores data in flexible JSON-like documents called BSON."
  },
  {
    title: "What are Indexes in MongoDB",
    content: "Indexes in MongoDB improve query performance by allowing the database to quickly locate documents without scanning the entire collection."
  },
  {
    title: "SQL vs NoSQL Databases",
    content: "SQL databases use structured schemas and tables, while NoSQL databases like MongoDB use flexible schemas and document-based storage."
  },
  {
    title: "What is Vector Search",
    content: "Vector search allows searching data based on semantic meaning using embeddings instead of exact keyword matching."
  },
  {
    title: "How Embeddings Work",
    content: "Embeddings convert text into numerical vectors that represent semantic meaning, enabling similarity search in AI applications."
  },
  {
    title: "MongoDB Atlas Overview",
    content: "MongoDB Atlas is a fully managed cloud database service that supports search, vector indexing, and scalable deployments."
  }
])