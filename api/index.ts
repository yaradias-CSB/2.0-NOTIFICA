import type { Request, Response } from "express";
import app from "../server";

export default function handler(req: Request, res: Response) {
  if (req.url) {
    const url = new URL(req.url, "http://localhost");
    const vercelPath = url.searchParams.get("__vercel_path");
    if (vercelPath !== null) {
      url.searchParams.delete("__vercel_path");
      const normalizedSegment = vercelPath.replace(/^\/+/, "");
      const qs = url.searchParams.toString();
      const targetPath = normalizedSegment ? `/api/${normalizedSegment}` : "/api";
      req.url = qs ? `${targetPath}?${qs}` : targetPath;
    }
  }
  return app(req, res);
}
