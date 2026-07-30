import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { AppComponent } from "./app/app.component";
import { authSessionInterceptor } from "./app/auth-session.interceptor";
import { routes } from "./app/app.routes";

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([authSessionInterceptor])),
    provideRouter(routes),
  ],
}).catch((error) => console.error(error));
