import Image from "@tiptap/extension-image";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { toast } from "sonner";
import { resolveMediaUrl } from "@/lib/media";

export type UploadFn = (file: File) => Promise<{ src: string; width: number; height: number }>;

/**
 * 画像ノード。
 * - src には private バケットのパス（silo-media:...）だけを保存する（base64 は入れない）
 * - 貼り付け直後は blob: URL で即表示し、uploadId が付いている間は「アップロード中」
 * - 表示時に署名 URL をまとめて解決する
 */
export const ResearchImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null, renderHTML: () => ({}), parseHTML: () => null },
    };
  },

  addNodeView() {
    return ({ node }) => {
      const wrap = document.createElement("figure");
      wrap.className = "silo-image";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;
      wrap.appendChild(img);

      let current: PMNode = node;
      let shownSrc = "";
      const render = (n: PMNode) => {
        const { src, width, height, uploadId, alt } = n.attrs as {
          src: string;
          width?: number | null;
          height?: number | null;
          uploadId?: string | null;
          alt?: string | null;
        };
        wrap.dataset.uploading = uploadId ? "true" : "false";
        img.alt = alt ?? "";
        if (width && height) {
          img.width = width;
          img.height = height;
          img.style.aspectRatio = `${width} / ${height}`;
        }
        if (src === shownSrc) return;
        shownSrc = src;
        if (src.startsWith("blob:") || src.startsWith("http")) {
          img.src = src;
        } else {
          resolveMediaUrl(src).then((url) => {
            if (shownSrc === src && url) img.src = url;
          });
        }
      };
      render(node);

      return {
        dom: wrap,
        update: (n) => {
          if (n.type !== current.type) return false;
          current = n;
          render(n);
          return true;
        },
      };
    };
  },
});

export function hasPendingUploads(doc: PMNode) {
  let pending = false;
  doc.descendants((n) => {
    if (n.type.name === "image" && n.attrs.uploadId) pending = true;
    return !pending;
  });
  return pending;
}

function findUpload(editor: Editor, uploadId: string): number | null {
  let pos: number | null = null;
  editor.state.doc.descendants((n, p) => {
    if (n.type.name === "image" && n.attrs.uploadId === uploadId) pos = p;
    return pos === null;
  });
  return pos;
}

/** 画像ファイルを即座に挿入し、裏でアップロードしてから保存可能な src に差し替える。 */
export function insertImageFiles(editor: Editor, files: File[], upload: UploadFn, at?: number) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return false;

  for (const file of images) {
    const uploadId = crypto.randomUUID();
    const blobUrl = URL.createObjectURL(file);
    const node = editor.schema.nodes.image.create({ src: blobUrl, uploadId });
    const tr = at !== undefined ? editor.state.tr.insert(at, node) : editor.state.tr.replaceSelectionWith(node);
    editor.view.dispatch(tr);

    upload(file)
      .then(({ src, width, height }) => {
        if (editor.isDestroyed) return;
        const pos = findUpload(editor, uploadId);
        if (pos === null) return; // アップロード中に削除された
        const cur = editor.state.doc.nodeAt(pos)!;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, src, width, height, uploadId: null })
        );
      })
      .catch((err) => {
        console.error("image upload failed", err);
        toast.error("画像をアップロードできませんでした");
        if (editor.isDestroyed) return;
        const pos = findUpload(editor, uploadId);
        if (pos !== null) {
          const cur = editor.state.doc.nodeAt(pos)!;
          editor.view.dispatch(editor.state.tr.delete(pos, pos + cur.nodeSize));
        }
      })
      .finally(() => setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000));
  }
  return true;
}
