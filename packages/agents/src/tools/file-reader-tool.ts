import { DynamicStructuredTool } from "@langchain/core/tools";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { PDFParse } from "pdf-parse";
import { z } from "zod";

const inputSchema = z.object({
  fileName: z.string().min(1).max(255),
  filePath: z.string().min(1).optional(),
  contentBase64: z.string().min(1).optional(),
});

export type FileReaderInput = z.infer<typeof inputSchema>;

async function extractText(fileName: string, data: Buffer): Promise<string> {
  const extension = extname(fileName).toLowerCase();

  if (extension === ".txt" || extension === ".csv") {
    return data.toString("utf8");
  }

  if (extension === ".pdf") {
    const parser = new PDFParse({ data });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  throw new Error("Unsupported file type. Supported types are PDF, TXT, and CSV.");
}

export function createFileReaderTool(
  readUploadedFile: (path: string) => Promise<Buffer> = (path) => readFile(path),
) {
  return new DynamicStructuredTool({
    name: "file_reader",
    description: "Extract text from an uploaded PDF, TXT, or CSV file.",
    schema: inputSchema,
    func: async (input: FileReaderInput) => {
      if (Boolean(input.filePath) === Boolean(input.contentBase64)) {
        throw new Error("Provide exactly one of filePath or contentBase64");
      }

      const data = input.contentBase64
        ? Buffer.from(input.contentBase64, "base64")
        : await readUploadedFile(input.filePath!);

      const text = await extractText(input.fileName, data);
      return JSON.stringify({ fileName: input.fileName, text });
    },
  });
}

export const fileReaderTool = createFileReaderTool();