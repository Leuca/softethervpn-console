import * as React from 'react';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant } from '@patternfly/react-core';

interface IDeletionModal {
  buttonText?: string;
  modalText: React.ReactNode;
  onConfirm: () => void;
  isDisabled?: boolean;
  // When set, the modal is driven from outside and the trigger button is not rendered
  externalToggle?: boolean;
}

const DeletionModal: React.FunctionComponent<IDeletionModal> = ({
  buttonText,
  modalText,
  onConfirm,
  isDisabled,
  externalToggle,
}) => {
  const isExternal = externalToggle === true || externalToggle === false;
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  React.useEffect(() => {
    if (isExternal) {
      setIsModalOpen(externalToggle as boolean);
    }
  }, [externalToggle, isExternal]);

  const handleModalToggle = () => setIsModalOpen((open) => !open);

  const handleConfirmClick = () => {
    setIsModalOpen(false);
    onConfirm();
  };

  return (
    <React.Fragment>
      {!isExternal && (
        <Button variant="primary" onClick={handleModalToggle} isDisabled={isDisabled}>
          {buttonText}
        </Button>
      )}
      <Modal variant={ModalVariant.small} isOpen={isModalOpen} onClose={handleModalToggle}>
        <ModalHeader title="Confirm Deletion" />
        <ModalBody>{modalText}</ModalBody>
        <ModalFooter>
          <Button key="confirm" variant="primary" onClick={handleConfirmClick}>
            Confirm
          </Button>
          <Button key="cancel" variant="link" onClick={handleModalToggle}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </React.Fragment>
  );
};

export { DeletionModal };
