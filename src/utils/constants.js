export const ROLES = Object.freeze(['user', 'staff', 'admin']);

/**
 * Permissions an admin can give a staff member. Admins implicitly have all of them;
 * a staff member can do nothing outside the permissions on their account.
 */
export const PERMISSIONS = Object.freeze({
  'users.view': 'See the user list',
  'users.create': 'Add new users',
  'users.update': 'Edit users',
  'users.delete': 'Remove users',
  'notes.view_all': 'Read everyone’s notes',
  'posts.delete_any': 'Delete any post',
});
export const PERMISSION_KEYS = Object.freeze(Object.keys(PERMISSIONS));

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;
