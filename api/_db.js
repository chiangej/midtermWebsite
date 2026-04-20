import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI environment variable");

let cachedClient = null;

export async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { maxPoolSize: 5 });
    await cachedClient.connect();
  }
  return cachedClient.db("personal-site");
}
