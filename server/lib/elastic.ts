import { Client } from "@elastic/elasticsearch";

let esClient: Client | null = null;

export function getElasticClient(): Client {
    if (esClient) return esClient;

    const node = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
    esClient = new Client({ node });
    return esClient;
}

export const HOSPITAL_INDEX = "hospitals";
