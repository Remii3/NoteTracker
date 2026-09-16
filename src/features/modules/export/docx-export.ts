import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";

import type { NoteContent } from "@/features/notes/types/model";
import type {
  ModuleExportData,
  ModuleExportTopic,
} from "../data/modules-repository";
import type { TopicImage } from "@/features/notes/types/topic-image";

type DocumentChild = Paragraph | Table;
type ImageType = "jpg" | "png" | "gif" | "bmp";
type PreparedImage = {
  type: ImageType;
  data: ArrayBuffer;
  transformation: { width: number; height: number };
};

const NUMBERING_REFERENCE = "notetracker-numbering";

export async function createModuleDocx(
  module: ModuleExportData,
  imagesByTopic: ReadonlyMap<string, TopicImage[]> = new Map(),
) {
  const inlineImages = await prepareInlineImages(module);
  const children: DocumentChild[] = [
    new Paragraph({
      text: module.name,
      heading: HeadingLevel.TITLE,
      spacing: { after: 360 },
    }),
  ];

  if (!module.chapters.length) {
    children.push(
      new Paragraph({ text: "Moduł nie zawiera jeszcze rozdziałów." }),
    );
  }

  for (const [chapterIndex, chapter] of module.chapters.entries()) {
    children.push(
      new Paragraph({
        text: `${chapterIndex + 1}. ${chapter.title}`,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: chapterIndex > 0,
      }),
    );
    if (!chapter.topics.length) {
      children.push(new Paragraph({ text: "Rozdział nie zawiera tematów." }));
      continue;
    }

    for (const [topicIndex, topic] of chapter.topics.entries()) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${chapterIndex + 1}.${topicIndex + 1} ${topic.title}`,
              bold: true,
            }),
            new TextRun({
              text: topic.completed ? "  ✓" : "",
              color: "17803D",
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        }),
      );
      children.push(
        ...convertBlocks(topic.content.content ?? [], 0, inlineImages),
      );
      children.push(
        ...(await convertTopicImages(topic, imagesByTopic.get(topic.id) ?? [])),
      );
    }
  }

  return new Document({
    creator: "NoteTracker",
    title: module.name,
    description: `Eksport modułu ${module.name} z NoteTracker`,
    numbering: {
      config: [
        {
          reference: NUMBERING_REFERENCE,
          levels: Array.from({ length: 6 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: { left: 720 + level * 360, hanging: 360 },
              },
            },
          })),
        },
      ],
    },
    sections: [{ children }],
  });
}

export async function downloadModuleDocx(
  module: ModuleExportData,
  imagesByTopic?: ReadonlyMap<string, TopicImage[]>,
) {
  const blob = await Packer.toBlob(
    await createModuleDocx(module, imagesByTopic),
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(module.name)}.docx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function safeFilename(value: string) {
  const filename = value
    .normalize("NFC")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return filename || "modul";
}

function convertBlocks(
  nodes: NoteContent[],
  listLevel = 0,
  inlineImages: ReadonlyMap<NoteContent, PreparedImage> = new Map(),
): DocumentChild[] {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case "paragraph":
        return [paragraphFromNode(node, {}, inlineImages)];
      case "heading":
        return [
          paragraphFromNode(
            node,
            {
              heading:
                Number(node.attrs?.level) === 3
                  ? HeadingLevel.HEADING_4
                  : HeadingLevel.HEADING_3,
            },
            inlineImages,
          ),
        ];
      case "bulletList":
        return convertList(node, "bullet", listLevel, inlineImages);
      case "orderedList":
        return convertList(node, "number", listLevel, inlineImages);
      case "blockquote":
        return (node.content ?? []).map((child) =>
          paragraphFromNode(
            child,
            {
              indent: { left: 480 },
              border: {
                left: { color: "A3A3A3", size: 12, space: 12, style: "single" },
              },
              color: "525252",
            },
            inlineImages,
          ),
        );
      case "codeBlock":
        return [
          paragraphFromNode(
            node,
            {
              font: "Consolas",
              shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
            },
            inlineImages,
          ),
        ];
      case "horizontalRule":
        return [new Paragraph({ text: "────────────────────────" })];
      case "table":
        return [convertTable(node, inlineImages)];
      case "image":
        return [new Paragraph({ children: imageChildren(node, inlineImages) })];
      default:
        return node.content?.length
          ? convertBlocks(node.content, listLevel, inlineImages)
          : [];
    }
  });
}

function convertList(
  node: NoteContent,
  kind: "bullet" | "number",
  level: number,
  inlineImages: ReadonlyMap<NoteContent, PreparedImage>,
) {
  const children: DocumentChild[] = [];
  for (const item of node.content ?? []) {
    const [first, ...rest] = item.content ?? [];
    if (first) {
      children.push(
        paragraphFromNode(
          first,
          {
            ...(kind === "bullet"
              ? { bullet: { level: Math.min(level, 8) } }
              : {
                  numbering: {
                    reference: NUMBERING_REFERENCE,
                    level: Math.min(level, 5),
                  },
                }),
          },
          inlineImages,
        ),
      );
    }
    children.push(...convertBlocks(rest, level + 1, inlineImages));
  }
  return children;
}

function paragraphFromNode(
  node: NoteContent,
  options: {
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    bullet?: { level: number };
    numbering?: { reference: string; level: number };
    indent?: { left: number };
    border?: {
      left: { color: string; size: number; space: number; style: "single" };
    };
    shading?: {
      fill: string;
      type: (typeof ShadingType)[keyof typeof ShadingType];
    };
    color?: string;
    font?: string;
  } = {},
  inlineImages: ReadonlyMap<NoteContent, PreparedImage> = new Map(),
) {
  return new Paragraph({
    children: inlineChildren(node.content ?? [], options, inlineImages),
    heading: options.heading,
    bullet: options.bullet,
    numbering: options.numbering,
    indent: options.indent,
    border: options.border,
    shading: options.shading,
    alignment: paragraphAlignment(node.attrs?.textAlign),
    spacing: { after: 100 },
  });
}

function inlineChildren(
  nodes: NoteContent[],
  inherited: { color?: string; font?: string } = {},
  inlineImages: ReadonlyMap<NoteContent, PreparedImage> = new Map(),
): ParagraphChild[] {
  return nodes.flatMap((node): ParagraphChild[] => {
    if (node.type === "hardBreak") return [new TextRun({ break: 1 })];
    if (node.type === "image") return imageChildren(node, inlineImages);
    if (node.type !== "text")
      return inlineChildren(node.content ?? [], inherited, inlineImages);

    const marks = node.marks ?? [];
    const link = marks.find((mark) => mark.type === "link")?.attrs?.href;
    const textStyle = marks.find((mark) => mark.type === "textStyle")?.attrs;
    const highlight = marks.find((mark) => mark.type === "highlight")?.attrs
      ?.color;
    const run = new TextRun({
      text: node.text ?? "",
      bold: marks.some((mark) => mark.type === "bold"),
      italics: marks.some((mark) => mark.type === "italic"),
      underline: marks.some((mark) => mark.type === "underline")
        ? {}
        : undefined,
      strike: marks.some((mark) => mark.type === "strike"),
      font: marks.some((mark) => mark.type === "code")
        ? "Consolas"
        : typeof textStyle?.fontFamily === "string"
          ? textStyle.fontFamily
          : inherited.font,
      color:
        typeof textStyle?.color === "string"
          ? normalizeColor(textStyle.color)
          : inherited.color,
      shading:
        typeof highlight === "string"
          ? { fill: normalizeColor(highlight), type: ShadingType.CLEAR }
          : undefined,
      superScript: marks.some((mark) => mark.type === "superscript"),
      subScript: marks.some((mark) => mark.type === "subscript"),
    });
    return typeof link === "string" && /^https?:\/\//i.test(link)
      ? [new ExternalHyperlink({ link, children: [run] })]
      : [run];
  });
}

function convertTable(
  node: NoteContent,
  inlineImages: ReadonlyMap<NoteContent, PreparedImage>,
) {
  const rows = (node.content ?? []).map(
    (row) =>
      new TableRow({
        children: (row.content ?? []).map((cell) => {
          const isHeader = cell.type === "tableHeader";
          const content = convertBlocks(cell.content ?? [], 0, inlineImages);
          return new TableCell({
            children: content.length ? content : [new Paragraph("")],
            columnSpan: numberAttr(cell.attrs?.colspan),
            rowSpan: numberAttr(cell.attrs?.rowspan),
            shading: isHeader
              ? { fill: "E5E7EB", type: ShadingType.CLEAR }
              : undefined,
          });
        }),
      }),
  );
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function convertTopicImages(
  topic: ModuleExportTopic,
  images: TopicImage[],
) {
  if (!images.length) return [];
  const children: DocumentChild[] = [
    new Paragraph({
      text: "Materiały",
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 100 },
    }),
  ];
  for (const image of images) {
    try {
      const prepared = await prepareImageSource(
        image.url,
        image.format,
        image.width,
        image.height,
      );
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: prepared.type,
              data: prepared.data,
              transformation: prepared.transformation,
              altText: {
                title: image.originalFilename,
                description: `Materiał do tematu ${topic.title}`,
                name: image.originalFilename,
              },
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          text: image.originalFilename,
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        }),
      );
    } catch {
      children.push(
        new Paragraph({
          text: `[Nie udało się dołączyć: ${image.originalFilename}]`,
        }),
      );
    } finally {
      if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url);
    }
  }
  return children;
}

async function prepareImageSource(
  url: string,
  format?: string,
  knownWidth?: number,
  knownHeight?: number,
): Promise<PreparedImage> {
  const response = await fetch(url);
  const blob = await response.blob();
  const directType = imageType(blob.type || `image/${format ?? ""}`);
  let width = knownWidth;
  let height = knownHeight;
  let bitmap: ImageBitmap | undefined;
  if (!width || !height || !directType) {
    bitmap = await createImageBitmap(blob);
    width = width || bitmap.width;
    height = height || bitmap.height;
  }
  if (directType) {
    bitmap?.close();
    return {
      type: directType,
      data: await blob.arrayBuffer(),
      transformation: fitImage(width ?? 600, height ?? 400),
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap?.width ?? width ?? 1;
  canvas.height = bitmap?.height ?? height ?? 1;
  if (bitmap) canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap?.close();
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("image-conversion-failed")),
      "image/png",
    ),
  );
  return {
    type: "png",
    data: await png.arrayBuffer(),
    transformation: fitImage(width ?? canvas.width, height ?? canvas.height),
  };
}

async function prepareInlineImages(module: ModuleExportData) {
  const entries: Array<[NoteContent, Promise<PreparedImage>]> = [];
  const visit = (node: NoteContent) => {
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      entries.push([
        node,
        prepareImageSource(
          node.attrs.src,
          undefined,
          numericValue(node.attrs.width),
          numericValue(node.attrs.height),
        ),
      ]);
    }
    node.content?.forEach(visit);
  };
  module.chapters.forEach((chapter) =>
    chapter.topics.forEach((topic) => visit(topic.content)),
  );
  const prepared = new Map<NoteContent, PreparedImage>();
  await Promise.all(
    entries.map(async ([node, promise]) => {
      try {
        prepared.set(node, await promise);
      } catch {
        // An inaccessible image is represented by its alternative text.
      }
    }),
  );
  return prepared;
}

function imageChildren(
  node: NoteContent,
  inlineImages: ReadonlyMap<NoteContent, PreparedImage>,
): ParagraphChild[] {
  const image = inlineImages.get(node);
  return image
    ? [
        new ImageRun({
          ...image,
          altText: {
            title: imageAlt(node),
            description: imageAlt(node),
            name: imageAlt(node),
          },
        }),
      ]
    : [new TextRun({ text: imageAlt(node), italics: true })];
}

function imageType(mime: string): ImageType | null {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  return null;
}

function fitImage(width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(1, 600 / safeWidth, 720 / safeHeight);
  return {
    width: Math.round(safeWidth * scale),
    height: Math.round(safeHeight * scale),
  };
}

function paragraphAlignment(value: unknown) {
  if (value === "center") return AlignmentType.CENTER;
  if (value === "right") return AlignmentType.RIGHT;
  if (value === "justify") return AlignmentType.JUSTIFIED;
  return undefined;
}

function normalizeColor(value: string) {
  return value.replace(/^#/, "").slice(0, 6).toUpperCase();
}

function numberAttr(value: unknown) {
  return typeof value === "number" && value > 1 ? value : undefined;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (parsed > 0) return parsed;
  }
  return undefined;
}

function imageAlt(node: NoteContent) {
  return `[Obraz${typeof node.attrs?.alt === "string" ? `: ${node.attrs.alt}` : ""}]`;
}
