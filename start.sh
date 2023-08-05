#!/bin/bash
#set -x # log

RM="rm -rfd"
RED='\033[0;31m'
NC='\033[0m'
GREEN='\033[0;32m'

function usage() {
  # Print usage on stdout
  function_names=$(grep '^[[:space:]]*function ' start.sh | sed -E 's/^[[:space:]]*function[[:space:]]+([^[:space:]()]+).*/\1/')
  echo "Available functions:"
  for func_name in ${function_names[@]}; do
    printf "    $func_name\n"
    awk "/function ${func_name}()/ { flag = 1 }; flag && /^\ +#/ { print \"        \" \$0 }; flag && !/^\ +#/ && !/function ${func_name}()/  { print "\n"; exit }" start.sh
  done
}

function error_exit() {
  # Print error message on stdout and exit
  printf "${RED}ERROR: $1${NC}\n"
  usage
  exit 1
}

function main() {
  # Main function: Call other functions based on input arguments
  [[ "$#" -eq 0 ]] && usage && exit 0
  while [ "$#" -gt 0 ]; do
    case "$1" in
    *) "$1" || error_exit "Failed to call function $1" ;;
    esac
    shift
  done
}

main "$@"
