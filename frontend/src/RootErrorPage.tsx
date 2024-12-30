import { Box, Stack, Typography } from "@mui/joy";
import { useRouteError } from "react-router";
import Layout from "./Layout";
import HeaderComponent from "./components/Header";
import Navigation from "./components/Navigation";

// This didn't work as expected.
// https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
// export class RootErrorBoundary extends Component<
//   {} & PropsWithChildren,
//   {
//     error: Error | null;
//     hasError: boolean;
//   }
// > {
//   // catch a promise error
//   // https://eddiewould.com/2021/28/28/handling-rejected-promises-error-boundary-react/
//   private promiseRejectionHandler = (event: PromiseRejectionEvent) => {
//     console.debug("unhandledrejection", event);
//     this.setState({
//       error: event.reason,
//     });
//   };

//   state = {
//     error: null,
//     hasError: false,
//   };

//   constructor(props) {
//     super(props);
//   }

//   static getDerivedStateFromError(error: Error) {
//     return { error };
//   }

//   componentDidMount(): void {
//     window.addEventListener("unhandledrejection", this.promiseRejectionHandler);
//   }

//   componentWillUnmount(): void {
//     window.removeEventListener(
//       "unhandledrejection",
//       this.promiseRejectionHandler
//     );
//   }

//   componentDidCatch(error: Error, errorInfo: ErrorInfo) {
//     console.error("Uncaught error:", {
//       error,
//       errorInfo,
//     });
//   }

//   render() {
//     console.debug("RootErrorBoundary", this.state);
//     if (this.state.error) {
//       return <RootErrorPage />;
//     }

//     return this.props.children;
//   }
// }

export default function RootErrorPage() {
  const error = useRouteError();
  console.error("unexpected error", error);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "minmax(64px, 200px) minmax(450px, 1fr)",
          md: "minmax(100px, 160px) minmax(500px, 1fr)",
        },
        gridTemplateRows: "64px 1fr",
        width: "100vw",
        height: "100vh",
        overflowY: "hidden",
      }}
    >
      <Layout.Header>
        <HeaderComponent />
      </Layout.Header>
      <Layout.SideNav>
        <Navigation />
      </Layout.SideNav>

      <Stack sx={{ p: 2, gap: 2 }}>
        <Typography level="h1">System error</Typography>
        <Typography>Something went wrong. Please try again later.</Typography>
        <Box>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </Box>
      </Stack>
    </Box>
  );
}
