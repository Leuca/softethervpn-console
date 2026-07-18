import * as React from 'react';
import { Alert } from '@patternfly/react-core';

interface FormErrorAlertProps {
  error: string | null;
  title: string;
}

const FormErrorAlert: React.FunctionComponent<FormErrorAlertProps> = ({ error, title }) =>
  error ? (
    <Alert
      variant="danger"
      title={title}
      isInline
      style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
    >
      {error}
    </Alert>
  ) : null;

export { FormErrorAlert };
