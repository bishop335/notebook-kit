/* eslint-disable @typescript-eslint/no-explicit-any */
const files = new Map<string, FileAttachmentImpl>();

export type DsvOptions = {delimiter?: string; array?: boolean; typed?: boolean};
export type DsvResult = any[] & {columns: string[]};

export interface FileAttachment {
  name: string;
  mimeType: string;
  href: string;
  lastModified: number | undefined;
  size: number | undefined;
  /** @deprecated use FileAttachment.href instead */
  url(): Promise<string>;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(encoding?: string): Promise<string>;
  json(): Promise<any>;
  stream(): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>>;
  dsv(options?: DsvOptions): Promise<DsvResult>;
  csv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult>;
  tsv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult>;
  image(props?: Partial<HTMLImageElement>): Promise<HTMLImageElement>;
  arrow(): Promise<any>;
  arquero(options?: any): Promise<any>;
  parquet(): Promise<any>;
  xml(mimeType?: DOMParserSupportedType): Promise<Document>;
  html(): Promise<Document>;
}

export function FileAttachment(name: string, base = document.baseURI): FileAttachment {
  if (new.target !== undefined) throw new TypeError("FileAttachment is not a constructor");
  const href = new URL(name, base).href;
  let file = files.get(href);
  if (!file) {
    file = new FileAttachmentImpl(href, name.split("/").pop()!);
    files.set(href, file);
  }
  return file;
}

async function remote_fetch(file: FileAttachment) {
  const response = await fetch(file.href);
  if (!response.ok) throw new Error(`Unable to load file: ${file.name}`);
  return response;
}

export abstract class AbstractFile implements FileAttachment {
  name!: string;
  mimeType!: string;
  lastModified!: number | undefined;
  size!: number | undefined;
  abstract href: string;
  constructor(
    name: string,
    mimeType = guessMimeType(name),
    lastModified?: number,
    size?: number
  ) {
    Object.defineProperties(this, {
      name: {value: `${name}`, enumerable: true},
      mimeType: {value: `${mimeType}`, enumerable: true},
      lastModified: {value: lastModified === undefined ? undefined : +lastModified, enumerable: true}, // prettier-ignore
      size: {value: size === undefined ? undefined : +size, enumerable: true}
    });
  }
  async url(): Promise<string> {
    return this.href;
  }
  async blob(): Promise<Blob> {
    return (await remote_fetch(this)).blob();
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await remote_fetch(this)).arrayBuffer();
  }
  async text(encoding?: string): Promise<string> {
    return encoding === undefined
      ? (await remote_fetch(this)).text()
      : new TextDecoder(encoding).decode(await this.arrayBuffer());
  }
  async json(): Promise<any> {
    return (await remote_fetch(this)).json();
  }
  async stream(): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>> {
    return (await remote_fetch(this)).body!;
  }
  async dsv({delimiter = ",", array = false, typed = false} = {}): Promise<DsvResult> {
    const [text, d3] = await Promise.all([this.text(), import("npm:d3-dsv")]);
    const format = d3.dsvFormat(delimiter);
    const parse = array ? format.parseRows : format.parse;
    return parse(text, typed && d3.autoType);
  }
  async csv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult> {
    return this.dsv({...options, delimiter: ","});
  }
  async tsv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult> {
    return this.dsv({...options, delimiter: "\t"});
  }
  async image(props?: Partial<HTMLImageElement>): Promise<HTMLImageElement> {
    const url = await this.url();
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      if (new URL(url, document.baseURI).origin !== location.origin) i.crossOrigin = "anonymous";
      Object.assign(i, props);
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Unable to load file: ${this.name}`));
      i.src = url;
    });
  }
  async arrow(): Promise<any> {
    const [Arrow, response] = await Promise.all([import("npm:apache-arrow"), remote_fetch(this)]);
    return Arrow.tableFromIPC(response);
  }
  async arquero(options?: any): Promise<any> {
    let request;
    let from;
    switch (this.mimeType) {
      case "application/json":
        request = this.text();
        from = "fromJSON";
        break;
      // @ts-expect-error fall through
      case "text/tab-separated-values":
        if (options?.delimiter === undefined) options = {...options, delimiter: "\t"};
      // fall through
      case "text/csv":
        request = this.text();
        from = "fromCSV";
        break;
      default:
        if (/\.arrow$/i.test(this.name)) {
          request = this.arrow();
          from = "fromArrow";
        } else if (/\.parquet$/i.test(this.name)) {
          request = this.parquet();
          from = "fromArrow";
        } else {
          throw new Error(`unable to determine Arquero loader: ${this.name}`);
        }
        break;
    }
    const [aq, body] = await Promise.all([import("npm:arquero"), request]);
    return aq[from](body, options);
  }
  async parquet() {
    const [Arrow, Parquet, buffer] = await Promise.all([import("npm:apache-arrow"), import("npm:parquet-wasm").then(async (Parquet) => (await Parquet.default("https://cdn.jsdelivr.net/npm/parquet-wasm/esm/parquet_wasm_bg.wasm"), Parquet)), this.arrayBuffer()]); // prettier-ignore
    return Arrow.tableFromIPC(Parquet.readParquet(new Uint8Array(buffer)).intoIPCStream());
  }
  async xml(mimeType: DOMParserSupportedType = "application/xml"): Promise<Document> {
    return new DOMParser().parseFromString(await this.text(), mimeType);
  }
  async html(): Promise<Document> {
    return this.xml("text/html");
  }
}

// TODO Replace this with static analysis of files.
function guessMimeType(name: string): string {
  const i = name.lastIndexOf(".");
  const j = name.lastIndexOf("/");
  const extension = i > 0 && (j < 0 || i > j) ? name.slice(i).toLowerCase() : "";
  switch (extension) {
    case ".csv":
      return "text/csv";
    case ".tsv":
      return "text/tab-separated-values";
    case ".json":
      return "application/json";
    case ".html":
      return "text/html";
    case ".xml":
      return "application/xml";
    case ".png":
      return "image/png";
    case ".jpg":
      return "image/jpg";
    case ".js":
      return "text/javascript";
    default:
      return "application/octet-stream";
  }
}

class FileAttachmentImpl extends AbstractFile {
  href!: string;
  constructor(href: string, name: string, mimeType?: string, lastModified?: number, size?: number) {
    super(name, mimeType, lastModified, size);
    Object.defineProperty(this, "href", {value: href});
  }
}

Object.defineProperty(FileAttachmentImpl, "name", {value: "FileAttachment"}); // prevent mangling
FileAttachment.prototype = FileAttachmentImpl.prototype; // instanceof

type FileResolver = (name: string) => {url: string; mimeType?: string} | string | null;

export function fileAttachments(resolve: FileResolver): (name: string) => FileAttachment {
  function FileAttachment(name: string) {
    const result = resolve((name += ""));
    if (result == null) throw new Error(`File not found: ${name}`);
    if (typeof result === "object" && "url" in result) {
      const {url, mimeType} = result;
      return new FileAttachmentImpl(url, name, mimeType);
    }
    return new FileAttachmentImpl(result, name);
  }
  FileAttachment.prototype = FileAttachmentImpl.prototype; // instanceof
  return FileAttachment;
}
