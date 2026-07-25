import type { Session } from "@homarr/auth";

export const canAccessUserEditPage = (session: Session | null, userId: string) => {
  if (!session) {
    return false;
  }

  if (session.user.id === userId) {
    return true;
  }

  if (session.user.permissions.includes("other-manage-users")) {
    return true;
  }

  return false;
};
