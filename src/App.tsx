import { MotionConfig } from "framer-motion";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { PortfolioStats } from "./components/PortfolioStats";
import { Skills } from "./components/Skills";
import { Projects } from "./components/Projects";
import { Experience } from "./components/Experience";
import { Contact } from "./components/Contact";
import { Footer } from "./components/Footer";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { useMotionOff } from "./lib/motion";

export default function App() {
  const motionOff = useMotionOff();
  return (
    <MotionConfig reducedMotion={motionOff ? "always" : "never"}>
      <div className="relative min-h-screen">
        <AnimatedBackground />
        <Navbar />
        <main className="flex flex-col gap-24 pb-24 md:gap-36 md:pb-36">
          <Hero />
          <Skills />
          <Projects />
          <PortfolioStats />
          <Experience />
          <Contact />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
