import EditorMockup from "./components/EditorMockup";
import FeaturesGrid from "./components/FeaturesGrid";
import Footer from "./components/Footer";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Navbar from "./components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <EditorMockup />
        <FeaturesGrid />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
