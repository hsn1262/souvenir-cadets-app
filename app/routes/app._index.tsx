import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  Badge,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { isManager, getActingStaffMember } from "../models/roles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const manager = await isManager(session.shop, staff?.gid);

  return { shop: session.shop, staff, manager };
};

const PHASES = [
  { name: "Central Inventory", status: "Live", tone: "success" as const, desc: "Products, variants, spec fields, images, stock." },
  { name: "Events (Locations, Allocate, Close)", status: "Live", tone: "success" as const, desc: "Each event becomes a Shopify Location." },
  { name: "Token → Draft Order", status: "Planned", tone: "attention" as const, desc: "Held quotes as Draft Orders." },
  { name: "Invoice → Order", status: "Planned", tone: "attention" as const, desc: "Completion decrements stock exactly once." },
  { name: "Online Sale", status: "Planned", tone: "attention" as const, desc: "Same invoice logic against Central." },
  { name: "Expenses & Reports", status: "Planned", tone: "attention" as const, desc: "Metaobjects + computed P&L." },
];

export default function Index() {
  const { staff, manager } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Souvenir for Cadets" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Welcome{staff ? `, ${staff.name}` : ""}
                </Text>
                <Text as="p" variant="bodyMd">
                  This is the native rebuild of the Souvenir for Cadets tool — same workflow, running on
                  Shopify's own inventory, orders and staff accounts instead of a spreadsheet. You are
                  currently signed in as {manager ? "a Manager" : "Staff"}
                  {manager ? " — you can see the reset/delete actions elsewhere in the app." : "."}
                </Text>
                {!manager && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Need Manager access (stock resets, deleting events, resetting sales logs)? Ask an
                    existing Manager to grant it from Staff Roles.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Build status
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  {PHASES.map((phase) => (
                    <Card key={phase.name} background="bg-surface-secondary">
                      <BlockStack gap="150">
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {phase.name}
                          </Text>
                          <Badge tone={phase.tone}>{phase.status}</Badge>
                        </BlockStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {phase.desc}
                        </Text>
                      </BlockStack>
                    </Card>
                  ))}
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  What changed from the spreadsheet version
                </Text>
                <List>
                  <List.Item>Stock lives in real Shopify InventoryItems — it can't go negative by accident.</List.Item>
                  <List.Item>There's no shared PIN. Destructive actions check the Staff Roles table against your real login.</List.Item>
                  <List.Item>Every product, sale and (soon) event is a real Shopify object your team can also see from normal Shopify Admin.</List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
