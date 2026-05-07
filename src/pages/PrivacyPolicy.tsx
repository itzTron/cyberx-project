import { motion } from 'framer-motion';
import Footer from '@/components/Footer';
import SectionHeader from '@/components/SectionHeader';
import GlassCard from '@/components/GlassCard';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-14 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto text-center">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/30 mb-4">
              LEGAL
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Privacy Policy</h1>
            <p className="text-muted-foreground text-lg">
              This policy explains how Cyberspace-X 2.0 handles web app usage data and personal information.
            </p>
            <p className="text-xs text-muted-foreground mt-4 font-mono">Effective date: May 7, 2026</p>
          </motion.div>
        </div>
      </section>

      <section className="py-12 relative z-10">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          <SectionHeader
            badge="DATA & USAGE"
            title="How We Collect and Use Data"
            description="Summary of data collection, usage, retention, and user controls for this web application."
          />

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-3">
              We collect account information you provide directly, such as name, username, email address, profile
              details, and optional links. We also process repository content and files you upload or create in the app.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Basic technical data may be collected during usage, including request metadata, timestamps, browser and
              device signals, and diagnostic logs needed to operate and secure the platform.
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. How We Use Data</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-3">Your data is used to:</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>- create and manage accounts and authenticated sessions</li>
              <li>- provide repository, upload, and collaboration features</li>
              <li>- support AI assistant requests and repository-related actions</li>
              <li>- improve platform reliability, security, and abuse prevention</li>
              <li>- communicate important service or policy updates</li>
            </ul>
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. AI Features and Conversation Data</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-3">
              AI chat features process prompts and responses so the assistant can generate outputs. Conversation history
              and related actions may be stored to provide continuity and user controls (for example, recall and delete
              history).
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Do not submit highly sensitive data into AI prompts unless your organization has approved that use.
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Sharing and Third-Party Services</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-3">
              We use third-party infrastructure and platform services (for example, authentication, database, storage,
              and model providers) to deliver functionality. Data is shared only as required for those services to work.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We do not sell personal data. We may disclose data when legally required, to enforce terms, or to protect
              the security and integrity of users and the platform.
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Retention and Security</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-3">
              We retain data for as long as necessary to provide services, maintain account functionality, satisfy legal
              obligations, and resolve disputes.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We apply reasonable administrative and technical safeguards, but no online system can guarantee absolute
              security. Users should also follow good security hygiene, including strong passwords and account protection.
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Your Controls</h2>
            <ul className="space-y-2 text-sm text-muted-foreground mb-3">
              <li>- update profile and account details in the web app</li>
              <li>- manage repository visibility and published repository listings</li>
              <li>- delete local AI conversation history where available in the interface</li>
            </ul>
            <p className="text-muted-foreground text-sm leading-relaxed">
              You can contact us for privacy-related requests or questions through the contact page.
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Policy Updates</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We may update this Privacy Policy as the platform evolves. Material changes will be reflected with an
              updated effective date and, where appropriate, additional notice in the application.
            </p>
          </GlassCard>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
