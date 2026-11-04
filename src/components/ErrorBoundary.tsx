import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // If the error is from third-party extensions like MetaMask, do not enter crash state
    const msg = `${error?.message || ''} ${error?.stack || ''}`.toLowerCase();
    if (
      msg.includes('metamask') ||
      msg.includes('failed to connect to metamask') ||
      msg.includes('ethereum') ||
      msg.includes('solana') ||
      msg.includes('phantom') ||
      msg.includes('web3') ||
      msg.includes('coinbase')
    ) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const msg = `${error?.message || ''} ${error?.stack || ''}`.toLowerCase();
    if (
      msg.includes('metamask') ||
      msg.includes('failed to connect to metamask') ||
      msg.includes('ethereum') ||
      msg.includes('solana') ||
      msg.includes('phantom') ||
      msg.includes('web3') ||
      msg.includes('coinbase')
    ) {
      // Suppress extension errors silently
      return;
    }
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 font-sans text-stone-900">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">오류가 발생했습니다</h2>
              <p className="text-xs text-stone-500 mt-1">
                화면을 렌더링하는 중 문제가 발생했습니다. 페이지를 새로고침하거나 다시 시도해주세요.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-3 bg-stone-50 border border-stone-200 rounded-lg text-left text-xs font-mono text-stone-700 max-h-24 overflow-y-auto">
                  {this.state.error.message}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>페이지 새로고침</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
