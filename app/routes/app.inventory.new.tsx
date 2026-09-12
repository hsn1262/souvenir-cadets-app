import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useActionData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Text,
  Button,
  Checkbox,
  Thumbnail,
  DropZone,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createProduct, type SpecFieldInput, type VariationInput } from "../models/inventory.server";
import { SPEC_FIELDS } from "../lib/constants";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  try {
    await createProduct(admin, {
      title: body.title,
      productType: body.productType,
      descriptionHtml: body.description,
      variations: body.variations as VariationInput[],
      specs: body.specs as SpecFieldInput,
      imageDataUrl: body.imageDataUrl || null,
      imageFilename: body.imageFilename || null,
    });
  } catch (err: any) {
    return { ok: false, error: err.message || "Something went wrong creating the product." };
  }
  return redirect("/app/inventory");
};

function emptyVariation(): VariationInput {
  return { label: "", sku: "", price: "", costRate: "", stock: 0 };
}

export default function NewProduct() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [title, setTitle] = useState("");
  const [productType, setProductType] = useState("");
  const [description, setDescription] = useState("");
  const [hasVariations, setHasVariations] = useState(false);
  const [variations, setVariations] = useState<VariationInput[]>([emptyVariation()]);
  const [specs, setSpecs] = useState<SpecFieldInput>(
    Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, { enabled: false, value: "" }])),
  );
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFilename, setImageFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData && "error" in actionData && actionData.error) {
      setError(actionData.error);
    }
  }, [actionData]);

  const updateVariation = (index: number, patch: Partial<VariationInput>) => {
    setVariations((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const handleDrop = (_files: File[], acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setImageFilename(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    setError(null);
    if (!title.trim()) {
      setError("Give the product a title.");
      return;
    }
    const activeVariations = hasVariations ? variations : [variations[0]];
    for (const v of activeVariations) {
      if (!v.sku || !v.price) {
        setError("Every variation needs a SKU and a price.");
        return;
      }
    }
    submit(
      {
        title,
        productType,
        description,
        variations: activeVariations.map((v) => ({
          ...v,
          label: hasVariations ? v.label || "Variant" : "Default",
          stock: Number(v.stock) || 0,
        })),
        specs,
        imageDataUrl,
        imageFilename,
      },
      { method: "POST", encType: "application/json" },
    );
  };

  return (
    <Page>
      <TitleBar title="Add product">
        <button onClick={() => navigate("/app/inventory")}>Cancel</button>
        <button variant="primary" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save product"}
        </button>
      </TitleBar>
      <BlockStack gap="400">
        {error && (
          <Card>
            <Text as="p" tone="critical">
              {error}
            </Text>
          </Card>
        )}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Basics
            </Text>
            <TextField label="Title" value={title} onChange={setTitle} autoComplete="off" />
            <TextField
              label="Product type"
              value={productType}
              onChange={setProductType}
              autoComplete="off"
              helpText='e.g. "Mug", "Notebook", "Keychain" — matches the old catalogue category.'
            />
            <TextField
              label="Description"
              value={description}
              onChange={setDescription}
              multiline={3}
              autoComplete="off"
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Image
            </Text>
            <DropZone accept="image/*" type="image" onDrop={handleDrop} allowMultiple={false}>
              {imageDataUrl ? (
                <div style={{ padding: 16 }}>
                  <Thumbnail source={imageDataUrl} alt={imageFilename ?? "preview"} size="large" />
                </div>
              ) : (
                <DropZone.FileUpload actionTitle="Add image" actionHint="or drop an image here" />
              )}
            </DropZone>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Variations
              </Text>
              <Checkbox
                label="This product has variations (size, colour, etc.)"
                checked={hasVariations}
                onChange={setHasVariations}
              />
            </InlineStack>
            {(hasVariations ? variations : [variations[0]]).map((variation, index) => (
              <BlockStack gap="200" key={index}>
                {hasVariations && <Divider />}
                <InlineStack gap="200" wrap>
                  {hasVariations && (
                    <div style={{ minWidth: 160 }}>
                      <TextField
                        label="Variation name"
                        labelHidden={index > 0}
                        placeholder="e.g. Small"
                        value={variation.label}
                        onChange={(v) => updateVariation(index, { label: v })}
                        autoComplete="off"
                      />
                    </div>
                  )}
                  <div style={{ minWidth: 140 }}>
                    <TextField
                      label="SKU"
                      labelHidden={index > 0}
                      value={variation.sku}
                      onChange={(v) => updateVariation(index, { sku: v })}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <TextField
                      label="Price"
                      labelHidden={index > 0}
                      type="number"
                      prefix="৳"
                      value={variation.price}
                      onChange={(v) => updateVariation(index, { price: v })}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <TextField
                      label="Cost rate"
                      labelHidden={index > 0}
                      type="number"
                      prefix="৳"
                      value={variation.costRate}
                      onChange={(v) => updateVariation(index, { costRate: v })}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <TextField
                      label="Initial stock"
                      labelHidden={index > 0}
                      type="number"
                      value={String(variation.stock)}
                      onChange={(v) => updateVariation(index, { stock: Number(v) })}
                      autoComplete="off"
                    />
                  </div>
                  {hasVariations && variations.length > 1 && (
                    <Button
                      icon="DeleteMinor"
                      variant="plain"
                      tone="critical"
                      onClick={() => setVariations((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            ))}
            {hasVariations && (
              <Button onClick={() => setVariations((prev) => [...prev, emptyVariation()])}>
                Add another variation
              </Button>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Specs
            </Text>
            <Text as="p" tone="subdued">
              The 8 fixed spec fields from the old catalogue form — toggle on the ones this product uses.
            </Text>
            {SPEC_FIELDS.map((field) => (
              <InlineStack gap="300" key={field.key} blockAlign="center" wrap={false}>
                <div style={{ minWidth: 180 }}>
                  <Checkbox
                    label={field.label}
                    checked={specs[field.key]?.enabled ?? false}
                    onChange={(checked) =>
                      setSpecs((prev) => ({ ...prev, [field.key]: { ...prev[field.key], enabled: checked } }))
                    }
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label={field.label}
                    labelHidden
                    disabled={!specs[field.key]?.enabled}
                    value={specs[field.key]?.value ?? ""}
                    onChange={(v) =>
                      setSpecs((prev) => ({ ...prev, [field.key]: { ...prev[field.key], value: v } }))
                    }
                    autoComplete="off"
                  />
                </div>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
