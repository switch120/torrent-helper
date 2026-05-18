export type ModalRouteCommand = [{ outlets: { modal: string[] | null } }];

export function modalRoute(...segments: string[]): ModalRouteCommand {
  return [{ outlets: { modal: segments } }];
}

export function closeModalRoute(): ModalRouteCommand {
  return [{ outlets: { modal: null } }];
}
