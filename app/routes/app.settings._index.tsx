import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Button, InlineStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { findLocationByName } from "../models/locations.server";
import { CENTRAL_LOCATION_NAME } from "../lib/constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const central = await findLocationByName(admin, CENTRAL_LOCATION_NAME);
  return { centralExists: Boolean(central), centralLocationName: CENTRAL_LOCATION_NAME };
};

export default function SettingsHub() {
  const { centralExists, centralLocationName } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page>
      <TitleBar title="Settings" />
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Staff Roles
              </Text>
              <Text as="p" tone="subdued">
                Who can reset stock, delete events, or reset sales logs — replaces the old shared PIN.
              </Text>
            </BlockStack>
            <Button onClick={() => navigate("/app/settings/roles")}>Manage</Button>
          </InlineStack>
        </Card>
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Data Fields
              </Text>
              <Text as="p" tone="subdued">
                Sync the 8 catalogue spec fields as real Shopify metafield definitions, so they also show
                up cleanly on the product page inside normal Shopify Admin.
              </Text>
            </BlockStack>
            <Button onClick={() => navigate("/app/settings/fields")}>Manage</Button>
          </InlineStack>
        </Card>
        <Card>
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Central Inventory location
            </Text>
            <Text as="p" tone="subdued">
              {centralExists
                ? `"${centralLocationName}" already exists — it's created automatically the first time you add a product.`
                : `Not created yet — it will be created automatically the first time you add a product or sync data fields.`}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
