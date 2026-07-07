import * as React from 'react';
import { Alert, AlertActionCloseButton, AlertGroup, AlertVariant } from '@patternfly/react-core';

interface IToastAlertGroup {
  // A false-to-true transition of 'add' appends one alert. The caller must
  // reset it to false before requesting the next one.
  add: boolean;
  title: string;
  variant: keyof typeof AlertVariant;
  child?: React.ReactNode;
}

interface IAlertEntry {
  title: string;
  variant: keyof typeof AlertVariant;
  child?: React.ReactNode;
  key: string;
}

const ToastAlertGroup: React.FunctionComponent<IToastAlertGroup> = ({ add, title, variant, child }) => {
  const [alerts, setAlerts] = React.useState<IAlertEntry[]>([]);
  const prevAdd = React.useRef(false);
  const alertId = React.useRef(0);

  React.useEffect(() => {
    if (add && !prevAdd.current) {
      alertId.current += 1;
      const key = `${Date.now()}-${alertId.current}`;
      setAlerts((current) => [...current, { title, variant, child, key }]);
    }
    prevAdd.current = add;
  }, [add, title, variant, child]);

  const removeAlert = (key: string) => {
    setAlerts((current) => current.filter((el) => el.key !== key));
  };

  return (
    <AlertGroup isToast>
      {alerts.map(({ key, variant: alertVariant, child: alertChild, title: alertTitle }) => (
        <Alert
          timeout={5000}
          isLiveRegion
          variant={AlertVariant[alertVariant]}
          title={alertTitle}
          actionClose={
            <AlertActionCloseButton
              title={alertTitle}
              variantLabel={`${alertVariant} alert`}
              onClose={() => removeAlert(key)}
            />
          }
          key={key}
        >
          {alertChild}
        </Alert>
      ))}
    </AlertGroup>
  );
};

export { ToastAlertGroup };
