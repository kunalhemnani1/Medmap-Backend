var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import prisma from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";
function getSessionUser(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const session = yield auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });
        return (_a = session === null || session === void 0 ? void 0 : session.user) !== null && _a !== void 0 ? _a : null;
    });
}
export function getBookmarks(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const bookmarks = yield prisma.bookmark.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: "desc" },
            });
            return res.json({ bookmarks });
        }
        catch (err) {
            console.error("Get bookmarks error:", err);
            return res.status(500).json({ error: "Failed to fetch bookmarks" });
        }
    });
}
export function addBookmark(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const { hospitalId, note } = req.body;
            if (!hospitalId)
                return res.status(400).json({ error: "hospitalId is required" });
            const bookmark = yield prisma.bookmark.upsert({
                where: { userId_hospitalId: { userId: user.id, hospitalId: Number(hospitalId) } },
                update: { note: note || null },
                create: { userId: user.id, hospitalId: Number(hospitalId), note: note || null },
            });
            return res.status(201).json({ bookmark });
        }
        catch (err) {
            console.error("Add bookmark error:", err);
            return res.status(500).json({ error: "Failed to add bookmark" });
        }
    });
}
export function removeBookmark(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospitalId = Number(req.params.hospitalId);
            yield prisma.bookmark.deleteMany({
                where: { userId: user.id, hospitalId },
            });
            return res.json({ success: true });
        }
        catch (err) {
            console.error("Remove bookmark error:", err);
            return res.status(500).json({ error: "Failed to remove bookmark" });
        }
    });
}
