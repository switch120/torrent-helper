export type ModalRouteCommand = ["/", { outlets: { modal: string[] | null } }];

export function modalRoute(...segments: string[]): ModalRouteCommand {
  return ["/", { outlets: { modal: segments } }];
}

export function closeModalRoute(): [{ outlets: { modal: null } }] {
  return [{ outlets: { modal: null } }];
}

export function modalCloseRouteForUrl(url: string): ModalRouteCommand | ReturnType<typeof closeModalRoute> {
  if (url.includes("(modal:downloads/history")) {
    return modalRoute("downloads");
  }

  return closeModalRoute();
}
