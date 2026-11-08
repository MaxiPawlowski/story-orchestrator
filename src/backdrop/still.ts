export interface BackgroundImage {
  image: string;
}

export interface BackdropStill {
  url: string;
  key: string;
}

const urlOf = (image: string): string | null => {
  const match = /url\((['"]?)(.*?)\1\)/.exec(image);
  return match?.[2]?.trim() || null;
};

const decodeEscapes = (text: string): string => text.replace(/(?:%[0-9a-f]{2})+/gi, (run) =>
  new TextDecoder().decode(new Uint8Array((run.match(/%[0-9a-f]{2}/gi) ?? []).map((escape) => parseInt(escape.slice(1), 16)))));

export const backdropKeyOf = (url: string): string => {
  const path = url.split(/[?#]/)[0];
  const file = path.split("/").pop() ?? path;
  return decodeEscapes(file).toLowerCase();
};

export const stillFromLayer = (layer: BackgroundImage | null): BackdropStill | null => {
  const url = layer ? urlOf(layer.image) : null;
  if (!url || /__transparent\.png$/i.test(url)) return null;
  return { url, key: backdropKeyOf(url) };
};
