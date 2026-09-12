import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Card, IndexTable, Text, Badge, EmptySearchResult, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { listEvents } from "../models/events.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const events = await listEvents(admin);
  return { events };
};

export default function EventsList() {
  const { events } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page>
      <TitleBar title="Event Sale">
        <button variant="primary" onClick={() => navigate("/app/events/new")}>
          New event
        </button>
      </TitleBar>
      <BlockStack gap="400">
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "event", plural: "events" }}
            itemCount={events.length}
            selectable={false}
            headings={[{ title: "Name" }, { title: "Dates" }, { title: "Status" }]}
            emptyState={
              <EmptySearchResult
                title="No events yet"
                description="Create your first event to allocate stock from Central Inventory."
                withIllustration
              />
            }
          >
            {events.map((event, index) => (
              <IndexTable.Row
                id={event.id}
                key={event.id}
                position={index}
                onClick={() => navigate(`/app/events/${event.id.split("/").pop()}`)}
              >
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">
                    {event.name}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {event.dateFrom ?? "—"} to {event.dateTo ?? "—"}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={event.status === "OPEN" ? "success" : undefined}>
                    {event.status === "OPEN" ? "Open" : "Closed"}
                  </Badge>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}
