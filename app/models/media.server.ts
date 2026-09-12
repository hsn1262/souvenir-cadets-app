// Replaces uploadFileToDrive() from Code.gs. The old app took a base64
// image from a <input type=file>/FileReader, POSTed it to Apps Script, and
// got back a lh3.googleusercontent.com URL to store on the catalogue row.
// Shopify's equivalent is a two-step "staged upload": ask Shopify for a
// short-lived upload URL, PUT the bytes there yourself, then attach the
// result to the product as Media.

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export async function uploadProductImageFromDataUrl(
  admin: AdminApiContext,
  productId: string,
  dataUrl: string,
  filename: string,
) {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 data URL for the product image.");
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation StageImageUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: [
          {
            filename,
            mimeType,
            httpMethod: "POST",
            resource: "IMAGE",
            fileSize: String(buffer.byteLength),
          },
        ],
      },
    },
  );
  const stagedJson = await stagedResponse.json();
  const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length) {
    throw new Error(`Could not start image upload: ${stagedErrors.map((e: any) => e.message).join("; ")}`);
  }
  const target = stagedJson.data.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const param of target.parameters as { name: string; value: string }[]) {
    form.append(param.name, param.value);
  }
  form.append("file", new Blob([buffer], { type: mimeType }), filename);

  const uploadResponse = await fetch(target.url, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    throw new Error(`Image upload to Shopify's storage failed (${uploadResponse.status}).`);
  }

  const mediaResponse = await admin.graphql(
    `#graphql
      mutation AttachProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { id status }
          mediaUserErrors { field message }
        }
      }`,
    {
      variables: {
        productId,
        media: [{ originalSource: target.resourceUrl, mediaContentType: "IMAGE", alt: filename }],
      },
    },
  );
  const mediaJson = await mediaResponse.json();
  const mediaErrors = mediaJson.data?.productCreateMedia?.mediaUserErrors ?? [];
  if (mediaErrors.length) {
    throw new Error(`Could not attach image to product: ${mediaErrors.map((e: any) => e.message).join("; ")}`);
  }
  return mediaJson.data.productCreateMedia.media[0];
}
