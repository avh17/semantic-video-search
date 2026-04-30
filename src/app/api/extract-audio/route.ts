import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { constants } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { access } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import ffmpegStaticPath from "ffmpeg-static";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_HOSTS = ["cdninstagram.com", "fbcdn.net", "instagram.com"];
const ffmpegBinaryName = basename(ffmpegStaticPath || "ffmpeg");

function isAllowedMediaUrl(mediaUrl: string) {
  try {
    const parsedUrl = new URL(mediaUrl);
    return ALLOWED_HOSTS.some((host) => parsedUrl.hostname.endsWith(host));
  } catch {
    return false;
  }
}

async function resolveFfmpegPath() {
  const candidates = [
    process.env.FFMPEG_PATH,
    join(process.cwd(), "node_modules", "ffmpeg-static", ffmpegBinaryName),
    ffmpegStaticPath,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return "ffmpeg";
}

async function runFfmpeg(args: string[]) {
  const ffmpegPath = await resolveFfmpegPath();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args);
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const { mediaUrl } = await request.json();

    if (!mediaUrl || typeof mediaUrl !== "string") {
      return NextResponse.json({ error: "mediaUrl is required" }, { status: 400 });
    }

    if (!isAllowedMediaUrl(mediaUrl)) {
      return NextResponse.json({ error: "URL not from an allowed domain" }, { status: 403 });
    }

    const mediaRes = await fetch(mediaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.instagram.com/",
      },
    });

    if (!mediaRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch media: ${mediaRes.status}` },
        { status: mediaRes.status || 500 }
      );
    }

    const id = randomUUID();
    const inputPath = join(tmpdir(), `${id}.mp4`);
    const outputPath = join(tmpdir(), `${id}.mp3`);

    try {
      await writeFile(inputPath, Buffer.from(await mediaRes.arrayBuffer()));

      await runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        outputPath,
      ]);

      const audioBuffer = await readFile(outputPath);

      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audioBuffer.byteLength),
        },
      });
    } finally {
      await Promise.allSettled([rm(inputPath), rm(outputPath)]);
    }
  } catch (error) {
    console.error("Extract audio error:", error);
    return NextResponse.json({ error: "Failed to extract audio" }, { status: 500 });
  }
}
