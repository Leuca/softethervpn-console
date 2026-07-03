import * as React from 'react';
import { Content, Divider, Flex, FlexItem, PageSection, Title } from '@patternfly/react-core';

interface AppPageProps {
  /** Page title, rendered as the single h1 of the view. */
  title: string;
  /** Optional one-line description shown under the title. */
  description?: React.ReactNode;
  /** Optional actions (buttons, menus) aligned to the top-right of the header. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared page scaffold: a consistent header band (title + description + actions)
 * over a filled body section. Every content page renders through this so the
 * whole console shares one rhythm and alignment.
 */
const AppPage: React.FunctionComponent<AppPageProps> = ({ title, description, actions, children }) => (
  <>
    <PageSection>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        flexWrap={{ default: 'wrap' }}
      >
        <FlexItem>
          <Title headingLevel="h1" size="2xl">
            {title}
          </Title>
          {description && (
            <Content
              component="p"
              style={{
                color: 'var(--pf-t--global--text--color--subtle)',
                marginBlockStart: 'var(--pf-t--global--spacer--xs)',
              }}
            >
              {description}
            </Content>
          )}
        </FlexItem>
        {actions && <FlexItem>{actions}</FlexItem>}
      </Flex>
    </PageSection>
    <Divider />
    <PageSection isFilled>{children}</PageSection>
  </>
);

export { AppPage };
