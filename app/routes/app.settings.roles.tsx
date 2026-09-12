import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  IndexTable,
  Badge,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  listShopStaffMembers,
  listStaffRoles,
  setStaffRole,
  isManager,
  getActingStaffMember,
} from "../models/roles.server";
import { ROLE_MANAGER, ROLE_STAFF } from "../lib/constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const viewerIsManager = await isManager(session.shop, staff?.gid);

  const [shopStaff, roleRows] = await Promise.all([
    listShopStaffMembers(admin),
    listStaffRoles(session.shop),
  ]);
  const roleByGid = new Map(roleRows.map((r) => [r.staffMemberGid, r.role]));

  const staffList = shopStaff.map((s) => ({
    gid: s.id,
    name: s.name,
    email: s.email,
    active: s.active,
    role: roleByGid.get(s.id) ?? ROLE_STAFF,
    isYou: s.id === staff?.gid,
  }));

  return { staffList, viewerIsManager, noManagersYet: roleRows.every((r) => r.role !== ROLE_MANAGER) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const staff = getActingStaffMember(session);
  const viewerIsManager = await isManager(session.shop, staff?.gid);

  const form = await request.formData();
  const targetGid = String(form.get("staffMemberGid"));
  const nextRole = String(form.get("role")) as typeof ROLE_MANAGER | typeof ROLE_STAFF;
  const staffName = String(form.get("staffName"));
  const staffEmail = (form.get("staffEmail") as string) || null;

  const noManagersYet = (await listStaffRoles(session.shop)).every((r) => r.role !== ROLE_MANAGER);

  // Bootstrap rule: if nobody is a Manager yet, the first person to open
  // this screen may promote themselves — otherwise every change requires
  // an existing Manager. This mirrors "whoever has the PIN can change the
  // PIN" from the old system, but only for the very first setup step.
  if (!viewerIsManager && !(noManagersYet && targetGid === staff?.gid)) {
    return { error: "Only a Manager can change staff roles." };
  }

  await setStaffRole(session.shop, targetGid, staffName, staffEmail, nextRole);
  return { ok: true };
};

export default function StaffRoles() {
  const { staffList, viewerIsManager, noManagersYet } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data && "ok" in fetcher.data) {
      shopify.toast.show("Role updated");
    }
    if (fetcher.data && "error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const toggleRole = (member: (typeof staffList)[number]) => {
    fetcher.submit(
      {
        staffMemberGid: member.gid,
        staffName: member.name,
        staffEmail: member.email ?? "",
        role: member.role === ROLE_MANAGER ? ROLE_STAFF : ROLE_MANAGER,
      },
      { method: "POST" },
    );
  };

  return (
    <Page>
      <TitleBar title="Staff Roles" />
      <BlockStack gap="400">
        {noManagersYet && (
          <Banner tone="warning" title="No Manager set yet">
            <p>
              Nobody is marked as a Manager, so destructive actions (stock resets, deleting events,
              resetting sales logs) are locked for everyone. Promote yourself below to get started —
              after that, only existing Managers can change roles.
            </p>
          </Banner>
        )}
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "staff member", plural: "staff members" }}
            itemCount={staffList.length}
            headings={[{ title: "Name" }, { title: "Email" }, { title: "Role" }, { title: "" }]}
            selectable={false}
          >
            {staffList.map((member, index) => (
              <IndexTable.Row id={member.gid} key={member.gid} position={index}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">
                    {member.name}
                    {member.isYou ? " (you)" : ""}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{member.email ?? "—"}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={member.role === ROLE_MANAGER ? "success" : undefined}>
                    {member.role === ROLE_MANAGER ? "Manager" : "Staff"}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Button
                    size="slim"
                    disabled={!viewerIsManager && !(noManagersYet && member.isYou)}
                    onClick={() => toggleRole(member)}
                  >
                    {member.role === ROLE_MANAGER ? "Revoke Manager" : "Make Manager"}
                  </Button>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}
