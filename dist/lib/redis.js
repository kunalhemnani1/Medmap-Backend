import { Redis } from "@upstash/redis";
let redis = null;
export function getRedis() {
    if (redis)
        return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    }
    redis = new Redis({ url, token });
    return redis;
}
