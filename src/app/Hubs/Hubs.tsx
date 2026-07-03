import * as React from 'react';
import { useParams } from 'react-router-dom';
import { HubList } from '@app/Hubs/HubList';
import { HubDetail } from '@app/Hubs/HubDetail';

// Mounted at both /hubs and /hubs/:hub: with a hub in the URL it shows that
// hub's management views, otherwise the list of hubs.
const Hubs: React.FunctionComponent = () => {
  const { hub } = useParams<{ hub: string }>();
  return hub ? <HubDetail name={hub} /> : <HubList />;
};

export { Hubs };
