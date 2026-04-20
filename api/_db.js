import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI environment variable");

let cachedClient = null;

export async function getDb() {
  if (cachedClient) {
    try {
      // ping to check if connection is still alive
      await cachedClient.db("admin").command({ ping: 1 });
    } catch {
      cachedClient = null;
    }
  }
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
    await cachedClient.connect();
  }
  return cachedClient.db("personal-site");
}
