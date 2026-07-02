import * as React from 'react';
import { Alert, AlertActionCloseButton, AlertGroup, AlertVariant } from '@patternfly/react-core';

interface IToastAlertGroup {
  // Rising edge on 'add' appends a new alert; remember to reset it to false
  // to avoid spawning alerts at every render
  add: boolean;
  title: string;
  variant: keyof typeof AlertVariant;
  child?: React.ReactNode;
}

interface IAlertEntry {
  title: string;
  variant: keyof typeof AlertVariant;
  child?: React.ReactNode;
  key: number;
}

const ToastAlertGroup: React.FunctionComponent<IToastAlertGroup> = ({ add, title, variant, child }) => {
  const [alerts, setAlerts] = React.useState<IAlertEntry[]>([]);
  const prevAdd = React.useRef(false);

  React.useEffect(() => {
    if (add && !prevAdd.current) {
      setAlerts((current) => [...current, { title, variant, child, key: new Date().getTime() }]);
    }
    prevAdd.current = add;
  }, [add, title, variant, child]);

  const removeAlert = (key: number) => {
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
