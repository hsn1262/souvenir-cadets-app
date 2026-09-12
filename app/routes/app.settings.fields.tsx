import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { Page, Card, BlockStack, Text, Button, List, Badge, InlineStack } from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ensureMetafieldDefinitions, allDefinitions } from "../models/metafields.server";

// allDefinitions() only reads static constants, but it still has to be
// called from the loader (not module scope in the component) — Remix's
// Vite plugin refuses to bundle a `.server.ts` import into client code,
// even a harmless one, once a route's default export touches it directly.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { defs: allDefinitions() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const results = await ensureMetafieldDefinitions(admin);
  return { results };
};

export default function DataFields() {
  const { defs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.results) {
      const failed = fetcher.data.results.filter((r) => !r.ok);
      shopify.toast.show(failed.length ? `${failed.length} field(s) failed — see below` : "Fields synced", {
        isError: failed.length > 0,
      });
    }
  }, [fetcher.data, shopify]);

  return (
    <Page>
      <TitleBar title="Data Fields" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Metafield definitions
              </Text>
              <Button
                variant="primary"
                loading={fetcher.state !== "idle"}
                onClick={() => fetcher.submit({}, { method: "POST" })}
              >
                Sync fields
              </Button>
            </InlineStack>
            <Text as="p" tone="subdued">
              Safe to run any time — it only creates definitions that don't already exist yet. Run this
              once after installing, and again if you add a new spec field to the app later.
            </Text>
            <List>
              {defs.map((d) => {
                const result = fetcher.data?.results.find((r) => r.key === `${d.namespace}.${d.key}`);
                return (
                  <List.Item key={`${d.namespace}.${d.key}`}>
                    {d.name} ({d.ownerType.toLowerCase()})
                    {result && (
                      <>
                        {" "}
                        <Badge tone={result.ok ? "success" : "critical"}>{result.ok ? "OK" : "Failed"}</Badge>
                      </>
                    )}
                  </List.Item>
                );
              })}
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
