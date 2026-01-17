import { deleteByUrl } from "../services/vectorstore.js";
import type { DeleteSourceResult } from "../types.js";

export type DeleteSourceInput = {
  url: string;
};

export async function deleteSource(input: DeleteSourceInput): Promise<DeleteSourceResult> {
  const { url } = input;

  try {
    // Validate URL
    new URL(url);

    const deletedCount = await deleteByUrl(url);

    if (deletedCount === 0) {
      return {
        success: false,
        deletedChunks: 0,
        url,
        error: "No documents found matching this URL",
      };
    }

    return {
      success: true,
      deletedChunks: deletedCount,
      url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      deletedChunks: 0,
      url,
      error: message,
    };
  }
}
