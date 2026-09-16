import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorState } from '../ui/ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by Vaango ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ padding: 'var(--space-12) var(--space-4)' }}>
          <ErrorState
            title="Application encountered a problem"
            message={this.state.error?.message || 'An unexpected rendering error occurred.'}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
