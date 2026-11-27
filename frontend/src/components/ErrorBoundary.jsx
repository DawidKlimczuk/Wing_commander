// =======================
// w tym pliku jest łapanie błędów w samym Reakcie - zamiast białej strony pokazuje się ekran awarii
// =======================
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Błąd w komponencie:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="scene active crash">
        <div className="crash-box">
          <div className="crash-title">*** BŁĄD KRYTYCZNY SYSTEMU NAWIGACJI ***</div>
          <p>Wystąpił nieoczekiwany wyjątek w module interfejsu.</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <p>Dane w bazie są bezpieczne - błąd dotyczy tylko ekranu.</p>
          <div className="btn-row">
            <button className="btn" onClick={() => this.setState({ error: null })}>SPRÓBUJ PONOWNIE</button>
            <button className="btn btn-danger" onClick={() => window.location.reload()}>RESTART</button>
          </div>
        </div>
      </section>
    );
  }
}
