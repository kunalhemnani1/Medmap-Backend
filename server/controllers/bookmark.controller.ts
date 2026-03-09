import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";

async function getSessionUser(req: Request) {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });
    return session?.user ?? null;
}

export async function getBookmarks(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const bookmarks = await prisma.bookmark.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
        });

        return res.json({ bookmarks });
    } catch (err) {
        console.error("Get bookmarks error:", err);
        return res.status(500).json({ error: "Failed to fetch bookmarks" });
    }
}

export async function addBookmark(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { hospitalId, note } = req.body;
        if (!hospitalId) return res.status(400).json({ error: "hospitalId is required" });

        const bookmark = await prisma.bookmark.upsert({
            where: { userId_hospitalId: { userId: user.id, hospitalId: Number(hospitalId) } },
            update: { note: note || null },
            create: { userId: user.id, hospitalId: Number(hospitalId), note: note || null },
        });

        return res.status(201).json({ bookmark });
    } catch (err) {
        console.error("Add bookmark error:", err);
        return res.status(500).json({ error: "Failed to add bookmark" });
    }
}

export async function removeBookmark(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const hospitalId = Number(req.params.hospitalId);
        await prisma.bookmark.deleteMany({
            where: { userId: user.id, hospitalId },
        });

        return res.json({ success: true });
    } catch (err) {
        console.error("Remove bookmark error:", err);
        return res.status(500).json({ error: "Failed to remove bookmark" });
    }
}
