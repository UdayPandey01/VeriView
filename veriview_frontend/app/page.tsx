'use client'
import Nav         from '@/components/Nav'
import Hero        from '@/components/Hero'
import Stats       from '@/components/Stats'
import SixLayers   from '@/components/SixLayers'
import HowItWorks  from '@/components/HowItWorks'
import Playground  from '@/components/Playground'
import CodeSection from '@/components/CodeSection'
import BentoGrid   from '@/components/BentoGrid'
import Pricing     from '@/components/Pricing'
import CtaSection  from '@/components/CtaSection'
import Footer      from '@/components/Footer'
import CursorGlow  from '@/components/CursorGlow'

export default function Home() {
  return (
    <>
      <CursorGlow />
      <Nav />
      <main>
        <Hero />
        <Stats />
        <SixLayers />
        <HowItWorks />
        <Playground />
        <CodeSection />
        <BentoGrid />
        <Pricing />
        <CtaSection />
      </main>
      <Footer />
    </>
  )
}
