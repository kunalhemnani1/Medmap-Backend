import express from "express";
import { getBookmarks, addBookmark, removeBookmark } from "../controllers/bookmark.controller.js";
const router = express.Router();
router.get("/bookmarks", getBookmarks);
router.post("/bookmarks", addBookmark);
router.delete("/bookmarks/:hospitalId", removeBookmark);
export default router;
